// src/features/p2p-share/hooks/useP2PSession.ts
/**
 * useP2PSession Hook
 * Manages share code-based WebRTC peer pairing
 * Works across any network — no WiFi restriction
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import Peer from 'peerjs';
import type { DataConnection } from 'peerjs';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api';
const isDev = import.meta.env.DEV === true;

// ---------------------------------------------------------------------------
// Logging — errors are real signals; suppress in prod to avoid leaking
// internal state (peer IDs, ICE candidates) to browser consoles.
// ---------------------------------------------------------------------------
const log = {
    error: (...args: unknown[]) => isDev && console.error('[P2P]', ...args),
};

// ---------------------------------------------------------------------------
// ICE / TURN config
// ---------------------------------------------------------------------------

/**
 * ICE server configuration.
 *
 * TURN servers are critical for cross-network transfers (different WiFi,
 * mobile LTE, etc.). Without a working TURN server, WebRTC falls back to
 * a direct connection attempt that often fails through NAT, resulting in
 * KB/s speeds or failed connections.
 *
 * Recommended setup (set in Vercel environment variables):
 *
 *   Option A — Metered.ca free tier (recommended, 100 GB/month free):
 *     VITE_METERED_API_KEY = your-api-key-from-metered.ca
 *     The hook will fetch fresh TURN credentials automatically.
 *
 *   Option B — Self-hosted / paid TURN (Coturn, Cloudflare, etc.):
 *     VITE_TURN_URL        = turn:your-server.example.com:443
 *     VITE_TURN_USERNAME   = username
 *     VITE_TURN_CREDENTIAL = password
 *
 *   Option C — No config (current):
 *     Falls back to openrelay.metered.ca public TURN.
 *     Works but is rate-limited, shared, and capped ~1 Mbps.
 *     Cross-network transfers will be slow.
 */

let cachedIceServers: RTCIceServer[] | null = null;
let iceServersFetchedAt = 0;
const ICE_CACHE_TTL = 5 * 60 * 1000; // 5 min — Metered credentials expire in 1 hr

async function buildIceServers(): Promise<RTCIceServer[]> {
    const now = Date.now();

    // Return cached servers if fresh
    if (cachedIceServers && now - iceServersFetchedAt < ICE_CACHE_TTL) {
        return cachedIceServers;
    }

    const servers: RTCIceServer[] = [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
    ];

    // Option A: Metered.ca dynamic credentials (best for cross-network)
    const meteredKey = import.meta.env.VITE_METERED_API_KEY;
    if (meteredKey) {
        try {
            const res = await fetch(
                `https://speakapp.metered.live/api/v1/turn/credentials?apiKey=${meteredKey}`,
                { signal: AbortSignal.timeout(5_000) }
            );
            if (res.ok) {
                const creds: RTCIceServer[] = await res.json();
                servers.push(...creds);
                cachedIceServers = servers;
                iceServersFetchedAt = now;
                return servers;
            }
        } catch {
            // Fall through to static config
        }
    }

    // Option B: Static TURN credentials from env
    const turnUrl = import.meta.env.VITE_TURN_URL;
    const turnUser = import.meta.env.VITE_TURN_USERNAME;
    const turnCred = import.meta.env.VITE_TURN_CREDENTIAL;

    if (turnUrl && turnUser && turnCred) {
        servers.push({ urls: turnUrl, username: turnUser, credential: turnCred });
    } else {
        // Option C: Public openrelay fallback
        servers.push(
            { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
            { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
            { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
        );
    }

    cachedIceServers = servers;
    iceServersFetchedAt = now;
    return servers;
}

// ---------------------------------------------------------------------------
// Connection options — must match on both sides
// ---------------------------------------------------------------------------

/**
 * 'binary' serialization is required for ArrayBuffer transfer.
 * PeerJS's default 'json' would silently corrupt binary data.
 * Must be set on BOTH the receiver's peer.connect() call AND accepted
 * on the sender's peer.on('connection') side (PeerJS uses the initiator's
 * setting for the channel negotiation).
 */
const CONN_OPTIONS = {
    reliable: true,
    serialization: 'binary',
} as const;

// ---------------------------------------------------------------------------
// Ready handshake
// ---------------------------------------------------------------------------

/**
 * PeerJS fires conn.on('open') when the DataChannel opens LOCALLY. But due
 * to signaling propagation delay (worse over dev tunnels, TURN relays, and
 * the PeerJS cloud signaling server), the remote side's data listeners may
 * not be attached yet.
 *
 * Fix: sender sends READY_PING immediately on open and waits for READY_PONG
 * before calling setConnection(). The receiver replies to the ping before
 * calling setConnection() on its side. This guarantees both sides have their
 * transfer handlers registered before the first P2PMessage is sent.
 */
const READY_PING = '__ready_ping__';
const READY_PONG = '__ready_pong__';

function waitForReadyPong(conn: DataConnection, timeoutMs = 15_000): Promise<void> {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            conn.off('data', handler);
            reject(new Error('Ready handshake timeout — receiver did not respond'));
        }, timeoutMs);
        const handler = (data: unknown) => {
            if (data === READY_PONG) {
                clearTimeout(timer);
                conn.off('data', handler);
                resolve();
            }
        };
        conn.on('data', handler);
    });
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SessionRole = 'sender' | 'receiver' | null;
export type SessionStatus =
    | 'idle'
    | 'creating'
    | 'waiting'
    | 'joining'
    | 'connecting'
    | 'connected'
    | 'error';

interface UseP2PSessionReturn {
    role: SessionRole;
    status: SessionStatus;
    shareCode: string | null;
    connection: DataConnection | null;
    error: string | null;
    createSession: () => Promise<string | null>;
    joinSession: (code: string) => Promise<boolean>;
    disconnect: () => void;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useP2PSession(): UseP2PSessionReturn {
    const [role, setRole] = useState<SessionRole>(null);
    const [status, setStatus] = useState<SessionStatus>('idle');
    const [shareCode, setShareCode] = useState<string | null>(null);
    const [connection, setConnection] = useState<DataConnection | null>(null);
    const [error, setError] = useState<string | null>(null);

    const peerRef = useRef<Peer | null>(null);
    const shareCodeRef = useRef<string | null>(null);

    useEffect(() => {
        return () => { cleanup(); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const cleanup = useCallback(() => {
        if (peerRef.current && !peerRef.current.destroyed) {
            peerRef.current.destroy();
            peerRef.current = null;
        }
        // Fire-and-forget DELETE — capture the code before clearing the ref
        const code = shareCodeRef.current;
        shareCodeRef.current = null;
        if (code) {
            fetch(`${API_BASE}/p2p/session/${code}`, { method: 'DELETE' }).catch(() => { });
        }
        setConnection(null);
        setShareCode(null);
        setRole(null);
        setStatus('idle');
        setError(null);
    }, []);

    const createPeer = useCallback(async (peerId: string): Promise<Peer> => {
        // Guard: destroy any existing peer before creating a new one
        if (peerRef.current && !peerRef.current.destroyed) {
            peerRef.current.destroy();
            peerRef.current = null;
        }

        // Fetch ICE servers (cached after first call within TTL)
        const iceServers = await buildIceServers();

        return new Promise((resolve, reject) => {
            const peer = new Peer(peerId, {
                config: { iceServers },
                debug: isDev ? 2 : 0,
            });
            const timeout = setTimeout(() => {
                peer.destroy();
                reject(new Error('Peer initialization timeout'));
            }, 15_000);
            peer.on('open', () => { clearTimeout(timeout); resolve(peer); });
            peer.on('error', (err) => { clearTimeout(timeout); reject(err); });
        });
    }, []);

    // -------------------------------------------------------------------------
    // SENDER
    // -------------------------------------------------------------------------

    const createSession = useCallback(async (): Promise<string | null> => {
        try {
            setRole('sender');
            setStatus('creating');
            setError(null);

            const peerId = `sa_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
            const peer = await createPeer(peerId);
            peerRef.current = peer;

            const response = await fetch(`${API_BASE}/p2p/create-session`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ peerId }),
            });

            if (!response.ok) {
                throw new Error(`Server error: ${response.status}`);
            }

            const data = await response.json();
            if (!data.success) throw new Error(data.error || 'Failed to create session');

            const code: string = data.data.code;
            setShareCode(code);
            shareCodeRef.current = code;
            setStatus('waiting');

            peer.on('connection', (conn) => {
                conn.on('open', async () => {
                    try {
                        conn.send(READY_PING);
                        await waitForReadyPong(conn);
                        setConnection(conn);
                        setStatus('connected');
                    } catch (err: any) {
                        log.error('Ready handshake failed:', err);
                        setError('Connection handshake failed — please try again');
                        setStatus('error');
                    }
                });
                conn.on('close', () => {
                    setConnection(null);
                    setStatus('waiting');
                });
                conn.on('error', (err) => {
                    log.error('Data connection error:', err);
                    setError('Connection error — please try again');
                    setStatus('error');
                });
            });

            peer.on('error', (err) => {
                log.error('Peer error:', err);
                setError(err.message);
                setStatus('error');
            });

            return code;
        } catch (err: any) {
            log.error('Failed to create session:', err);
            setError(err.message || 'Failed to create session');
            setStatus('error');
            return null;
        }
    }, [createPeer]);

    // -------------------------------------------------------------------------
    // RECEIVER
    // -------------------------------------------------------------------------

    const joinSession = useCallback(async (code: string): Promise<boolean> => {
        try {
            setRole('receiver');
            setStatus('joining');
            setError(null);

            const upperCode = code.toUpperCase().trim();

            const response = await fetch(`${API_BASE}/p2p/join/${upperCode}`);

            if (!response.ok && response.status !== 404 && response.status !== 410) {
                throw new Error(`Server error: ${response.status}`);
            }

            const data = await response.json();
            if (!data.success) throw new Error(data.error || 'Session not found');

            const senderPeerId: string = data.data.peerId;
            if (!senderPeerId || typeof senderPeerId !== 'string' || senderPeerId.length > 128) {
                throw new Error('Invalid session data received');
            }

            setShareCode(upperCode);
            shareCodeRef.current = upperCode;

            const peerId = `sa_recv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
            const peer = await createPeer(peerId);
            peerRef.current = peer;
            setStatus('connecting');

            const conn = peer.connect(senderPeerId, CONN_OPTIONS);

            await new Promise<void>((resolve, reject) => {
                const timeout = setTimeout(() => reject(new Error('Connection timeout (30 s)')), 30_000);

                conn.on('open', () => {
                    // Reply to sender's ping before exposing connection to app,
                    // so listenForBatchRequest's useEffect is guaranteed to have
                    // run by the time the sender gets the pong.
                    const pingHandler = (msg: unknown) => {
                        if (msg === READY_PING) {
                            conn.off('data', pingHandler);
                            conn.send(READY_PONG);
                            clearTimeout(timeout);
                            setConnection(conn);
                            setStatus('connected');
                            resolve();
                        }
                    };
                    conn.on('data', pingHandler);
                });

                conn.on('error', (err) => { clearTimeout(timeout); reject(err); });
            });

            conn.on('close', () => { setConnection(null); setStatus('idle'); });
            peer.on('error', (err) => {
                log.error('Peer error:', err);
                setError(err.message);
                setStatus('error');
            });

            return true;
        } catch (err: any) {
            log.error('Failed to join session:', err);
            setError(err.message || 'Failed to join session');
            setStatus('error');
            return false;
        }
    }, [createPeer]);

    const disconnect = useCallback(() => { cleanup(); }, [cleanup]);

    return { role, status, shareCode, connection, error, createSession, joinSession, disconnect };
}