/**
 * P2P Transfer Service — v4
 *
 * Key design points:
 *  - Adaptive chunk size: 16 KB over TURN relay, 64 KB for direct P2P
 *    (large chunks over relay cause head-of-line blocking; 16 KB matches
 *     the TURN server's typical MTU and reduces retransmit cost)
 *  - Correct backpressure: low water mark of 64 KB, NOT 2-4 MB
 *    (the old 4 MB high-water was bypassing SCTP congestion control —
 *     worked on desktop LAN, collapsed on mobile and cross-network)
 *  - Let SCTP do its job: we keep the pipe just full enough (one drain
 *     cycle = one chunk) so the browser's own congestion window adapts
 *     correctly to both fast desktop links and slow mobile/relay links
 *  - Per-file SHA-256 integrity via SubtleCrypto
 *  - Cancellation via AbortSignal, connection-drop detection, idle timeout
 *  - Progress throttled via requestAnimationFrame
 */

import type { DataConnection } from 'peerjs';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Chunk sizes tuned per connection type.
 *
 * Direct (LAN/same-network): 64 KB — maximises throughput, SCTP handles it.
 * Relay (TURN): 16 KB — TURN servers relay UDP packets; large chunks get
 *   fragmented and retransmitted more expensively. 16 KB stays under the
 *   typical TURN relay MTU and lets SCTP slow-start work properly.
 */
const CHUNK_SIZE_DIRECT = 64 * 1024;  // 64 KB
const CHUNK_SIZE_RELAY = 16 * 1024;  // 16 KB

/**
 * Backpressure threshold.
 *
 * We pause sending when bufferedAmount exceeds this and resume when it
 * drops below. The value must be SMALL — just enough to keep one chunk
 * in flight. This lets the browser's SCTP congestion control operate
 * normally. The old 4 MB value was wrong: it flooded the send buffer,
 * bypassing congestion control, which worked on a desktop LAN but
 * collapsed on mobile (small SCTP buffer ~256 KB) and TURN relay.
 *
 * Rule of thumb: HIGH_WATER = 2× the chunk size you're sending.
 * LOW_THRESHOLD = 0 (drain completely before sending next chunk).
 */
const BUFFER_HIGH_WATER_DIRECT = CHUNK_SIZE_DIRECT * 2;  // 128 KB
const BUFFER_HIGH_WATER_RELAY = CHUNK_SIZE_RELAY * 2;  //  32 KB
const BUFFER_LOW_THRESHOLD = 0;  // drain fully — let SCTP refill at its own pace

const ACCEPT_TIMEOUT_MS = 30_000;
const RECEIVE_IDLE_TIMEOUT_MS = 60_000;

// ---------------------------------------------------------------------------
// Logging — silent in production
// ---------------------------------------------------------------------------

const isDev = typeof import.meta !== 'undefined' && (import.meta as any).env?.DEV === true;
const log = {
    info: (...a: unknown[]) => isDev && console.info('[P2P]', ...a),
    warn: (...a: unknown[]) => isDev && console.warn('[P2P]', ...a),
    error: (...a: unknown[]) => isDev && console.error('[P2P]', ...a),
};

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface FileEntry {
    file: File;
    relativePath: string;
}

export interface FileMetadataEntry {
    name: string;
    size: number;
    type: string;
    relativePath: string;
}

export interface BatchMetadata {
    files: FileMetadataEntry[];
    totalSize: number;
    totalFiles: number;
    folderName?: string;
}

export type P2PMessageType =
    | 'batch-request'
    | 'accept'
    | 'reject'
    | 'chunk'
    | 'file-complete'
    | 'batch-complete'
    | 'error'
    | 'cancel';

export interface P2PMessage {
    type: P2PMessageType;
    transferId: string;
    metadata?: BatchMetadata;
    fileIndex?: number;
    chunkIndex?: number;
    totalChunks?: number;
    chunkData?: ArrayBuffer;
    sha256?: string;
    error?: string;
}

export interface TransferProgress {
    totalFiles: number;
    completedFiles: number;
    currentFileName: string;
    currentFileProgress: number;
    overallProgress: number;
    speed: number;               // bytes/sec
    bytesTransferred: number;
    totalBytes: number;
    eta: number;                 // seconds remaining
    connectionType: 'direct' | 'relay' | 'unknown';
}

export interface PendingBatchTransfer {
    transferId: string;
    metadata: BatchMetadata;
    connection: DataConnection;
}

export interface ReceivedFile {
    blob: Blob;
    metadata: FileMetadataEntry;
    integrityOk: boolean;
}

// ---------------------------------------------------------------------------
// Public helpers
// ---------------------------------------------------------------------------

export function filesToEntries(files: File[] | FileList): FileEntry[] {
    const entries: FileEntry[] = [];
    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        entries.push({ file, relativePath: (file as any).webkitRelativePath || file.name });
    }
    return entries;
}

export function buildBatchMetadata(entries: FileEntry[], folderName?: string): BatchMetadata {
    const files: FileMetadataEntry[] = entries.map((e) => ({
        name: e.file.name,
        size: e.file.size,
        type: e.file.type || 'application/octet-stream',
        relativePath: e.relativePath,
    }));
    return {
        files,
        totalSize: files.reduce((s, f) => s + f.size, 0),
        totalFiles: files.length,
        folderName,
    };
}

export function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export function formatEta(seconds: number): string {
    if (!isFinite(seconds) || seconds <= 0) return '–';
    if (seconds < 60) return `${Math.round(seconds)}s`;
    return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function sha256Hex(buffer: ArrayBuffer): Promise<string> {
    const digest = await crypto.subtle.digest('SHA-256', buffer);
    return Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, '0')).join('');
}

function concatBuffers(chunks: ArrayBuffer[]): ArrayBuffer {
    const total = chunks.reduce((s, c) => s + c.byteLength, 0);
    const out = new Uint8Array(total);
    let offset = 0;
    for (const c of chunks) { out.set(new Uint8Array(c), offset); offset += c.byteLength; }
    return out.buffer;
}

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
 * Detect whether the active ICE candidate pair is using a TURN relay.
 * Returns 'relay', 'direct', or 'unknown' (if stats API unavailable).
 *
 * This determines the chunk size and buffer thresholds to use.
 * Mobile browsers and cross-network connections typically fall back to TURN.
 */
async function detectConnectionType(
    conn: DataConnection
): Promise<'direct' | 'relay' | 'unknown'> {
    try {
        const dc = getRTCDataChannel(conn);
        if (!dc) return 'unknown';

        // Walk up to the RTCPeerConnection via the DataChannel
        // PeerJS exposes it as conn.peerConnection or conn._pc
        const pc: RTCPeerConnection | undefined =
            (conn as any).peerConnection ??
            (conn as any)._pc ??
            (conn as any).pc;

        if (!pc || typeof pc.getStats !== 'function') return 'unknown';

        const stats = await pc.getStats();
        for (const report of stats.values()) {
            if (report.type === 'candidate-pair' && report.state === 'succeeded') {
                const local = stats.get(report.localCandidateId);
                if (local?.candidateType === 'relay') return 'relay';
                return 'direct';
            }
        }
        return 'unknown';
    } catch {
        return 'unknown';
    }
}

/**
 * Prime the DataChannel's bufferedAmountLowThreshold.
 * Must be called before each send loop so the event fires correctly
 * on every file transfer, not just the first.
 */
function primeDataChannel(conn: DataConnection): void {
    const dc = getRTCDataChannel(conn);
    if (dc) dc.bufferedAmountLowThreshold = BUFFER_LOW_THRESHOLD;
}

/**
 * Pause sending until the buffer drains below the threshold.
 *
 * High-water mark is kept deliberately small (128 KB direct, 32 KB relay)
 * so SCTP's own congestion window can adapt to the link. Flooding the
 * buffer with 4 MB (old approach) bypassed congestion control entirely —
 * fast on desktop LAN but catastrophic on mobile and TURN relay.
 */
function waitForDrain(conn: DataConnection, highWater: number): Promise<void> {
    const dc = getRTCDataChannel(conn);
    if (!dc || dc.bufferedAmount < highWater) return Promise.resolve();

    return new Promise<void>((resolve) => {
        const fallback = setTimeout(resolve, 5_000);
        const onLow = () => {
            clearTimeout(fallback);
            dc.removeEventListener('bufferedamountlow', onLow);
            resolve();
        };
        dc.addEventListener('bufferedamountlow', onLow);
    });
}

function makeProgressEmitter(cb?: (p: TransferProgress) => void) {
    let rafId: number | null = null;
    let latest: TransferProgress | null = null;
    return {
        emit(p: TransferProgress) {
            latest = p;
            if (cb && rafId === null) {
                rafId = requestAnimationFrame(() => { rafId = null; if (latest) cb(latest); });
            }
        },
        flush() {
            if (cb && latest) cb(latest);
            if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
        },
    };
}

// ---------------------------------------------------------------------------
// Sender
// ---------------------------------------------------------------------------

export async function sendBatch(
    entries: FileEntry[],
    connection: DataConnection,
    onProgress?: (p: TransferProgress) => void,
    signal?: AbortSignal
): Promise<void> {
    if (entries.length === 0) throw new Error('No files to send');
    signal?.throwIfAborted();

    const transferId = `batch_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const metadata = buildBatchMetadata(entries);
    const progress = makeProgressEmitter(onProgress);

    if (!connection.open) {
        await new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Connection timeout')), 10_000);
            signal?.addEventListener('abort', () => { clearTimeout(timeout); reject(signal.reason); });
            connection.once('open', () => { clearTimeout(timeout); resolve(); });
        });
    }

    signal?.throwIfAborted();

    signal?.addEventListener('abort', () => {
        try { connection.send({ type: 'cancel', transferId, error: 'Cancelled by sender' } satisfies P2PMessage); } catch { /* best-effort */ }
    });

    // Detect relay vs direct BEFORE starting — determines chunk size and buffer limits
    const connType = await detectConnectionType(connection);
    const chunkSize = connType === 'relay' ? CHUNK_SIZE_RELAY : CHUNK_SIZE_DIRECT;
    const highWater = connType === 'relay' ? BUFFER_HIGH_WATER_RELAY : BUFFER_HIGH_WATER_DIRECT;

    log.info(`Connection type: ${connType}, chunk: ${chunkSize / 1024}KB, highWater: ${highWater / 1024}KB`);

    // Arm listener BEFORE sending to avoid the race where accept arrives first
    const acceptPromise = waitForAccept(connection, transferId, signal);
    connection.send({ type: 'batch-request', transferId, metadata } satisfies P2PMessage);

    const accepted = await acceptPromise;
    if (!accepted) throw new Error('Transfer declined by receiver');

    const startTime = Date.now();
    let totalBytesTransferred = 0;

    for (let fileIdx = 0; fileIdx < entries.length; fileIdx++) {
        signal?.throwIfAborted();

        const { file } = entries[fileIdx];
        const totalChunks = Math.ceil(file.size / chunkSize) || 1;

        // Single read — hash and chunks both come from this buffer
        const fullBuffer = await file.arrayBuffer();
        const integrityPromise = sha256Hex(fullBuffer);

        // Prime threshold before loop — must run on every file
        primeDataChannel(connection);

        for (let chunkIdx = 0; chunkIdx < totalChunks; chunkIdx++) {
            signal?.throwIfAborted();

            // Wait for buffer to drain before sending next chunk.
            // Small high-water mark lets SCTP congestion control work correctly
            // across both fast desktop links and slow mobile/relay connections.
            await waitForDrain(connection, highWater);

            const start = chunkIdx * chunkSize;
            const end = Math.min(start + chunkSize, file.size);

            connection.send({
                type: 'chunk',
                transferId,
                fileIndex: fileIdx,
                chunkIndex: chunkIdx,
                totalChunks,
                chunkData: fullBuffer.slice(start, end),
            } satisfies P2PMessage);

            totalBytesTransferred += end - start;

            const elapsed = (Date.now() - startTime) / 1000;
            const speed = elapsed > 0 ? totalBytesTransferred / elapsed : 0;

            progress.emit({
                totalFiles: entries.length,
                completedFiles: fileIdx,
                currentFileName: file.name,
                currentFileProgress: Math.round(((chunkIdx + 1) / totalChunks) * 100),
                overallProgress: Math.round((totalBytesTransferred / metadata.totalSize) * 100),
                speed,
                bytesTransferred: totalBytesTransferred,
                totalBytes: metadata.totalSize,
                eta: speed > 0 ? (metadata.totalSize - totalBytesTransferred) / speed : Infinity,
                connectionType: connType,
            });
        }

        connection.send({
            type: 'file-complete',
            transferId,
            fileIndex: fileIdx,
            sha256: await integrityPromise,
        } satisfies P2PMessage);
    }

    connection.send({ type: 'batch-complete', transferId } satisfies P2PMessage);
    progress.flush();
}

function waitForAccept(
    connection: DataConnection,
    transferId: string,
    signal?: AbortSignal
): Promise<boolean> {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(
            () => { cleanup(); reject(new Error('No response from receiver (30 s timeout)')); },
            ACCEPT_TIMEOUT_MS
        );
        const onClose = () => { cleanup(); reject(new Error('Connection closed while waiting for accept')); };
        const onAbort = () => { cleanup(); reject(signal!.reason); };
        const handler = (data: unknown) => {
            if (typeof data === 'string') return;
            const msg = data as P2PMessage;
            if (msg.transferId !== transferId) return;
            if (msg.type === 'accept') { cleanup(); setTimeout(() => resolve(true), 200); }
            else if (msg.type === 'reject') { cleanup(); resolve(false); }
        };
        function cleanup() {
            clearTimeout(timeout);
            connection.off('data', handler);
            connection.off('close', onClose);
            signal?.removeEventListener('abort', onAbort);
        }
        connection.on('data', handler);
        connection.once('close', onClose);
        signal?.addEventListener('abort', onAbort);
    });
}

// ---------------------------------------------------------------------------
// Receiver
// ---------------------------------------------------------------------------

export function listenForBatchRequest(
    connection: DataConnection,
    onRequest: (pending: PendingBatchTransfer) => void
): () => void {
    const handler = (data: unknown) => {
        if (typeof data === 'string') return;
        const msg = data as P2PMessage;
        if (
            msg.type === 'batch-request' &&
            msg.metadata &&
            typeof msg.transferId === 'string' &&
            Array.isArray(msg.metadata.files) &&
            typeof msg.metadata.totalSize === 'number'
        ) {
            onRequest({ transferId: msg.transferId, metadata: msg.metadata, connection });
        }
    };
    connection.on('data', handler);
    return () => connection.off('data', handler);
}

/** @deprecated Use acceptAndReceive() to avoid a race condition. */
export function acceptBatchTransfer(pending: PendingBatchTransfer): void {
    pending.connection.send({ type: 'accept', transferId: pending.transferId } satisfies P2PMessage);
}

export function rejectBatchTransfer(pending: PendingBatchTransfer): void {
    pending.connection.send({ type: 'reject', transferId: pending.transferId } satisfies P2PMessage);
}

/**
 * Accept and begin receiving atomically.
 * Attaches the data handler FIRST, then sends 'accept'.
 */
export function acceptAndReceive(
    pending: PendingBatchTransfer,
    onProgress?: (p: TransferProgress) => void,
    signal?: AbortSignal
): Promise<ReceivedFile[]> {
    const receivePromise = receiveBatch(pending, onProgress, signal);
    pending.connection.send({ type: 'accept', transferId: pending.transferId } satisfies P2PMessage);
    return receivePromise;
}

export async function receiveBatch(
    pending: PendingBatchTransfer,
    onProgress?: (p: TransferProgress) => void,
    signal?: AbortSignal
): Promise<ReceivedFile[]> {
    signal?.throwIfAborted();

    // Detect connection type on receiver side too (for progress reporting)
    const connType = await detectConnectionType(pending.connection);
    const chunkSize = connType === 'relay' ? CHUNK_SIZE_RELAY : CHUNK_SIZE_DIRECT;

    return new Promise((resolve, reject) => {
        const { metadata, connection, transferId } = pending;
        const progress = makeProgressEmitter(onProgress);
        const startTime = Date.now();
        let totalBytesReceived = 0;
        let completedFiles = 0;
        let settled = false;

        const fileChunks: (ArrayBuffer | undefined)[][] = metadata.files.map(() => []);
        const results: ReceivedFile[] = [];
        let idleTimer: ReturnType<typeof setTimeout>;

        const settle = (fn: () => void) => {
            if (settled) return;
            settled = true;
            cleanup();
            fn();
        };

        const resetIdleTimer = () => {
            clearTimeout(idleTimer);
            idleTimer = setTimeout(
                () => settle(() => reject(new Error(`Receive timed out — no data for ${RECEIVE_IDLE_TIMEOUT_MS / 1000} s`))),
                RECEIVE_IDLE_TIMEOUT_MS
            );
        };

        function cleanup() {
            clearTimeout(idleTimer);
            connection.off('data', handler);
            connection.off('close', onClose);
            signal?.removeEventListener('abort', onAbort);
            progress.flush();
        }

        const onClose = () => settle(() => reject(new Error('Connection closed before transfer completed')));
        const onAbort = () => {
            try { connection.send({ type: 'cancel', transferId, error: 'Cancelled by receiver' } satisfies P2PMessage); } catch { /* best-effort */ }
            settle(() => reject(signal!.reason));
        };

        connection.once('close', onClose);
        signal?.addEventListener('abort', onAbort);
        resetIdleTimer();

        const handler = async (data: unknown) => {
            if (typeof data === 'string') return;
            const msg = data as P2PMessage;
            if (msg.transferId !== transferId) return;

            resetIdleTimer();

            try {
                switch (msg.type) {
                    case 'chunk': {
                        const fIdx = msg.fileIndex!;
                        const cIdx = msg.chunkIndex!;
                        const chunkData = msg.chunkData!;
                        if (fIdx < 0 || fIdx >= metadata.files.length) break;

                        fileChunks[fIdx][cIdx] = chunkData;
                        totalBytesReceived += chunkData.byteLength;

                        const elapsed = (Date.now() - startTime) / 1000;
                        const speed = elapsed > 0 ? totalBytesReceived / elapsed : 0;
                        const fileMeta = metadata.files[fIdx];
                        const totalFileChunks = msg.totalChunks ?? (Math.ceil(fileMeta.size / chunkSize) || 1);

                        progress.emit({
                            totalFiles: metadata.totalFiles,
                            completedFiles,
                            currentFileName: fileMeta.name,
                            currentFileProgress: Math.round(((cIdx + 1) / totalFileChunks) * 100),
                            overallProgress: Math.round((totalBytesReceived / metadata.totalSize) * 100),
                            speed,
                            bytesTransferred: totalBytesReceived,
                            totalBytes: metadata.totalSize,
                            eta: speed > 0 ? (metadata.totalSize - totalBytesReceived) / speed : Infinity,
                            connectionType: connType,
                        });
                        break;
                    }

                    case 'file-complete': {
                        const fIdx = msg.fileIndex!;
                        const fileMeta = metadata.files[fIdx];
                        const chunks = fileChunks[fIdx];
                        const expectedChunks = Math.ceil(fileMeta.size / chunkSize) || 1;
                        for (let i = 0; i < expectedChunks; i++) {
                            if (!chunks[i]) chunks[i] = new ArrayBuffer(0);
                        }
                        const combined = concatBuffers(chunks as ArrayBuffer[]);
                        let integrityOk = true;
                        if (msg.sha256) {
                            const actualHash = await sha256Hex(combined);
                            integrityOk = actualHash === msg.sha256;
                            if (!integrityOk) log.warn(`Integrity check failed for "${fileMeta.name}"`);
                        }
                        results.push({ blob: new Blob([combined], { type: fileMeta.type }), metadata: fileMeta, integrityOk });
                        fileChunks[fIdx] = [];
                        completedFiles++;
                        break;
                    }

                    case 'batch-complete':
                        settle(() => resolve(results));
                        break;

                    case 'cancel':
                        settle(() => reject(new Error(`Transfer cancelled by sender: ${msg.error ?? 'unknown reason'}`)));
                        break;

                    case 'error':
                        settle(() => reject(new Error(msg.error || 'Unknown transfer error')));
                        break;
                }
            } catch (err) {
                settle(() => reject(err));
            }
        };

        connection.on('data', handler);
    });
}

// ---------------------------------------------------------------------------
// Download helpers
// ---------------------------------------------------------------------------

export function downloadSingleFile(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.style.display = 'none';
    document.body.appendChild(a); a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
}

export function downloadAllFiles(results: ReceivedFile[]): void {
    for (const result of results) {
        if (!result.integrityOk) {
            log.warn(`Skipping "${result.metadata.name}" — integrity check failed`);
            continue;
        }
        downloadSingleFile(result.blob, result.metadata.name);
    }
}