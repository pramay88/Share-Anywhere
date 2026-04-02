/**
 * adaptiveTransfer.ts — Adaptive Transfer Engine
 *
 * This file adds dynamic adaptation ON TOP of your existing p2pTransfer.ts.
 * It does NOT replace anything — it is imported and used inside sendBatch().
 *
 * What it controls:
 *  1. Chunk size: starts at 16 KB, scales up to 128 KB on good networks
 *  2. Drain strategy: replaces the fixed waitForDrain() with one that measures
 *     actual drain time and feeds it back into the chunk-size decision
 *  3. Connection type detection: TURN relay → stay conservative (16 KB max),
 *     direct peer-to-peer → allow full scaling (128 KB)
 *  4. RTT measurement via WebRTC Stats API: high RTT → reduce chunk size
 *
 * Usage in sendBatch():
 *   const engine = new AdaptiveTransferEngine(connection);
 *   await engine.init();                   // detect connection type + prime DC
 *   const chunkSize = engine.chunkSize;    // use instead of CHUNK_SIZE constant
 *   await engine.smartWaitForDrain();      // use instead of waitForDrain()
 *   engine.recordChunkSent(bytesSent);     // call after every chunk send
 */

import type { DataConnection } from 'peerjs';

// ---------------------------------------------------------------------------
// Chunk size ladder
// ---------------------------------------------------------------------------
// Steps we are allowed to climb or drop.
// We stay at 16 KB for TURN relay connections (see init()).
const CHUNK_LADDER = [
    16 * 1024,   // 16 KB — safe default, your existing value
    32 * 1024,   // 32 KB
    64 * 1024,   // 64 KB
    128 * 1024,  // 128 KB — only used on direct + low-RTT connections
] as const;

// ---------------------------------------------------------------------------
// Backpressure thresholds
// ---------------------------------------------------------------------------
// HIGH_WATER: pause sending when bufferedAmount exceeds this.
// LOW_THRESHOLD: resume when it drains below this.
//
// We keep these DYNAMIC: on a direct connection we widen the window so the
// pipe is always full; on a relay we keep it tight to avoid relay queue bloat.
const HIGH_WATER_DIRECT = 256 * 1024;  // 256 KB (16 chunks at 16 KB, or 2 at 128 KB)
const HIGH_WATER_RELAY  = 64 * 1024;   //  64 KB  (conservative for TURN relay)

// LOW_THRESHOLD must always be > 0.
// Reason: draining to zero means the OS fully flushes each chunk before we
// send the next one — a full RTT stall per chunk. One chunk worth of "in-flight"
// data keeps SCTP busy. We scale this with current chunk size so the proportion
// stays constant as we adapt.
const LOW_THRESHOLD_RATIO = 1; // = 1 × currentChunkSize

// ---------------------------------------------------------------------------
// Adaptation tuning
// ---------------------------------------------------------------------------
// PROMOTE_AFTER:  how many consecutive "fast drains" before we step up chunk size
// DEMOTE_AFTER:   how many consecutive "slow drains" before we step down
// FAST_DRAIN_MS:  drain time below which a drain is considered "fast"
// SLOW_DRAIN_MS:  drain time above which a drain is considered "slow"
const PROMOTE_AFTER  = 8;    // chunks
const DEMOTE_AFTER   = 3;    // chunks — demote faster than promote (safety first)
const FAST_DRAIN_MS  = 5;    // ms
const SLOW_DRAIN_MS  = 30;   // ms

// RTT thresholds (from WebRTC Stats API)
const RTT_HIGH_MS    = 100;  // ms — above this, cap chunk size at 32 KB
const RTT_MEDIUM_MS  = 40;   // ms — above this, cap chunk size at 64 KB

// ---------------------------------------------------------------------------
// Internal helpers (duplicated from p2pTransfer.ts for self-containment)
// ---------------------------------------------------------------------------

/**
 * Safely find the underlying RTCDataChannel from a PeerJS DataConnection.
 * Tries all known property names, then scans all keys to survive minification.
 */
function getRTCDataChannel(conn: DataConnection): RTCDataChannel | null {
    const c = conn as any;
    for (const candidate of [c.dataChannel, c._dc, c._channel, c.channel]) {
        if (candidate instanceof RTCDataChannel) return candidate;
    }
    for (const key of Object.keys(c)) {
        if (c[key] instanceof RTCDataChannel) return c[key];
    }
    return null;
}

/**
 * Get the underlying RTCPeerConnection from a PeerJS DataConnection.
 * Same resilience strategy as getRTCDataChannel.
 */
function getRTCPeerConnection(conn: DataConnection): RTCPeerConnection | null {
    const c = conn as any;
    for (const candidate of [c.peerConnection, c._pc, c._peerConnection]) {
        if (candidate instanceof RTCPeerConnection) return candidate;
    }
    for (const key of Object.keys(c)) {
        if (c[key] instanceof RTCPeerConnection) return c[key];
    }
    return null;
}

// ---------------------------------------------------------------------------
// AdaptiveTransferEngine
// ---------------------------------------------------------------------------

export class AdaptiveTransferEngine {
    // ---- Current state ----

    /** Current chunk size in bytes. Read this in your send loop instead of CHUNK_SIZE. */
    chunkSize: number = CHUNK_LADDER[0];

    /** Current high-water mark for backpressure. Adjusted after init(). */
    highWater: number = HIGH_WATER_RELAY;

    /** Whether the connection is direct P2P (true) or TURN relay (false). */
    isDirect: boolean = false;

    // ---- Private state ----

    private conn: DataConnection;
    private ladderIndex: number = 0;

    // Consecutive counts driving promotion / demotion
    private fastDrainStreak: number = 0;
    private slowDrainStreak: number = 0;

    // RTT from the WebRTC Stats API (updated lazily every ~2 s)
    private lastRttMs: number | null = null;
    private statsInterval: ReturnType<typeof setInterval> | null = null;

    // Bytes sent in the current window — used for logging / future pacing
    private bytesSentWindow: number = 0;

    constructor(conn: DataConnection) {
        this.conn = conn;
    }

    // -------------------------------------------------------------------------
    // Public API
    // -------------------------------------------------------------------------

    /**
     * Call once before your send loop starts.
     *
     * - Detects connection type (direct vs relay) via ICE candidate stats
     * - Sets initial chunk size based on connection type
     * - Sets bufferedAmountLowThreshold on the DataChannel
     * - Starts background RTT polling
     */
    async init(): Promise<void> {
        this.isDirect = await this.detectConnectionType();

        // Start conservative; let the promotion logic grow chunk size naturally
        if (this.isDirect) {
            this.ladderIndex = 1;          // start at 32 KB on direct connections
            this.chunkSize = CHUNK_LADDER[1];
            this.highWater = HIGH_WATER_DIRECT;
        } else {
            this.ladderIndex = 0;          // stay at 16 KB on relay
            this.chunkSize = CHUNK_LADDER[0];
            this.highWater = HIGH_WATER_RELAY;
        }

        this.primeDataChannel();
        this.startRttPolling();
    }

    /**
     * Call after every chunk send so the engine can track throughput.
     */
    recordChunkSent(bytes: number): void {
        this.bytesSentWindow += bytes;
    }

    /**
     * Drop-in replacement for your existing waitForDrain().
     *
     * Measures actual drain time and feeds it back into chunk-size adaptation:
     *  - fast drains → eventually promote chunk size (more data per send)
     *  - slow drains → eventually demote chunk size (less pressure on buffer)
     *
     * A 5 s safety timeout (same as your original) ensures a silently-closed
     * channel never hangs the loop.
     */
    async smartWaitForDrain(): Promise<void> {
        const dc = getRTCDataChannel(this.conn);

        if (!dc || dc.bufferedAmount < this.highWater) {
            // Buffer is fine — count this as a fast drain
            this.recordDrain(0);
            return;
        }

        const drainStart = performance.now();

        await new Promise<void>((resolve) => {
            const fallback = setTimeout(resolve, 5_000);
            const onLow = () => {
                clearTimeout(fallback);
                dc.removeEventListener('bufferedamountlow', onLow);
                resolve();
            };
            dc.addEventListener('bufferedamountlow', onLow);
        });

        const drainMs = performance.now() - drainStart;
        this.recordDrain(drainMs);
        this.maybeAdaptChunkSize();
    }

    /**
     * Call when the transfer is done (or cancelled) to clean up the RTT poll.
     */
    destroy(): void {
        if (this.statsInterval !== null) {
            clearInterval(this.statsInterval);
            this.statsInterval = null;
        }
    }

    // -------------------------------------------------------------------------
    // Connection type detection
    // -------------------------------------------------------------------------

    /**
     * Inspect the selected ICE candidate pair to determine if the connection
     * is direct (host/srflx candidate) or relay (relay/TURN candidate).
     *
     * Falls back to false (conservative = relay) if stats are unavailable —
     * e.g. in browsers that don't expose the full RTCStatsReport, or if
     * PeerJS's internal RTCPeerConnection is not accessible after minification.
     *
     * Why this works correctly (unlike the old _pc detection you had):
     * We scan ALL keys for an RTCPeerConnection instance, not just _pc, so
     * it survives Vite's production minifier.
     */
    private async detectConnectionType(): Promise<boolean> {
        const pc = getRTCPeerConnection(this.conn);
        if (!pc) return false; // can't detect → stay conservative

        try {
            const stats = await pc.getStats();
            let isDirect = false;

            stats.forEach((report) => {
                // We want the currently selected candidate pair
                if (report.type !== 'candidate-pair') return;
                if (!report.nominated) return;      // not the active pair
                if (report.state !== 'succeeded') return;

                // Look up the local candidate that belongs to this pair
                const localCandidateId = report.localCandidateId;
                const localCandidate = stats.get(localCandidateId);

                if (localCandidate) {
                    // candidateType: 'host' or 'srflx' = direct P2P
                    // candidateType: 'relay' = TURN relay
                    isDirect = localCandidate.candidateType !== 'relay';
                }
            });

            return isDirect;
        } catch {
            return false; // stats API failed → conservative default
        }
    }

    // -------------------------------------------------------------------------
    // RTT polling via WebRTC Stats API
    // -------------------------------------------------------------------------

    /**
     * Polls RTT every 2 seconds from the active ICE candidate pair stats.
     * RTT is used as an additional cap on chunk size: high RTT → smaller chunks.
     *
     * RTT alone is not enough to control throughput (that's bufferedAmount's job),
     * but it prevents us from sending 128 KB chunks on a high-latency TURN relay
     * where the buffer could easily take 200+ ms to drain.
     *
     * If stats are unavailable, lastRttMs stays null and RTT capping is skipped.
     */
    private startRttPolling(): void {
        const pc = getRTCPeerConnection(this.conn);
        if (!pc) return;

        this.statsInterval = setInterval(async () => {
            try {
                const stats = await pc.getStats();
                stats.forEach((report) => {
                    if (report.type !== 'candidate-pair') return;
                    if (!report.nominated) return;
                    if (typeof report.currentRoundTripTime === 'number') {
                        // currentRoundTripTime is in seconds — convert to ms
                        this.lastRttMs = report.currentRoundTripTime * 1000;
                    }
                });
            } catch {
                // Stats API unavailable — ignore, RTT capping stays off
            }
        }, 2_000);
    }

    // -------------------------------------------------------------------------
    // Chunk size adaptation
    // -------------------------------------------------------------------------

    /**
     * Record how long a drain took and update the fast/slow streak counters.
     * Called from smartWaitForDrain().
     */
    private recordDrain(drainMs: number): void {
        if (drainMs <= FAST_DRAIN_MS) {
            this.fastDrainStreak++;
            this.slowDrainStreak = 0;
        } else if (drainMs >= SLOW_DRAIN_MS) {
            this.slowDrainStreak++;
            this.fastDrainStreak = 0;
        } else {
            // Medium drain — reset both streaks gently (don't promote OR demote)
            this.fastDrainStreak = Math.max(0, this.fastDrainStreak - 1);
            this.slowDrainStreak = Math.max(0, this.slowDrainStreak - 1);
        }
    }

    /**
     * Decide whether to promote or demote chunk size, applying RTT caps.
     * Called after each drain measurement.
     *
     * Promotion requires:
     *   - PROMOTE_AFTER consecutive fast drains
     *   - Direct connection (not relay)
     *   - RTT is not high (if RTT data is available)
     *
     * Demotion requires:
     *   - DEMOTE_AFTER consecutive slow drains (no connection-type restriction)
     *   OR
     *   - RTT is high AND we're above the RTT-capped chunk size
     */
    private maybeAdaptChunkSize(): void {
        // --- RTT-based cap ---
        // Regardless of drain speed, never exceed this based on measured RTT
        const rttCappedIndex = this.rttChunkCapIndex();

        // --- Demotion ---
        if (this.slowDrainStreak >= DEMOTE_AFTER) {
            this.slowDrainStreak = 0;
            this.fastDrainStreak = 0;
            if (this.ladderIndex > 0) {
                this.ladderIndex--;
                this.applyChunkSize();
            }
            return;
        }

        // RTT hard cap (demote if above cap even without slow drains)
        if (rttCappedIndex !== null && this.ladderIndex > rttCappedIndex) {
            this.ladderIndex = rttCappedIndex;
            this.applyChunkSize();
            return;
        }

        // --- Promotion ---
        if (this.fastDrainStreak >= PROMOTE_AFTER) {
            this.fastDrainStreak = 0;

            // Never promote above RTT cap, relay constraint, or top of ladder
            const maxIndex = Math.min(
                CHUNK_LADDER.length - 1,
                this.isDirect ? CHUNK_LADDER.length - 1 : 0, // relay stays at 16 KB
                rttCappedIndex ?? CHUNK_LADDER.length - 1,
            );

            if (this.ladderIndex < maxIndex) {
                this.ladderIndex++;
                this.applyChunkSize();
            }
        }
    }

    /**
     * Returns the maximum ladder index allowed by current RTT, or null if
     * RTT data is not yet available.
     */
    private rttChunkCapIndex(): number | null {
        if (this.lastRttMs === null) return null;
        if (this.lastRttMs >= RTT_HIGH_MS)   return 1; // cap at 32 KB
        if (this.lastRttMs >= RTT_MEDIUM_MS) return 2; // cap at 64 KB
        return CHUNK_LADDER.length - 1;                // no cap
    }

    /**
     * Apply the current ladderIndex → chunkSize and update the DataChannel
     * threshold to match.
     */
    private applyChunkSize(): void {
        this.chunkSize = CHUNK_LADDER[this.ladderIndex];
        this.primeDataChannel();
    }

    // -------------------------------------------------------------------------
    // DataChannel management
    // -------------------------------------------------------------------------

    /**
     * Set bufferedAmountLowThreshold on the DataChannel.
     * Must be called:
     *  - Once in init() to arm it for the first file
     *  - Again in applyChunkSize() whenever chunk size changes, because
     *    the threshold is expressed in bytes — it must track chunk size
     *
     * LOW_THRESHOLD = 1 × chunkSize keeps SCTP from ever fully idling.
     */
    private primeDataChannel(): void {
        const dc = getRTCDataChannel(this.conn);
        if (dc) {
            dc.bufferedAmountLowThreshold = this.chunkSize * LOW_THRESHOLD_RATIO;
        }
    }
}