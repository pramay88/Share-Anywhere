/**
 * useP2PSession Hook
 * Manages share code-based WebRTC peer pairing
 * Works across any network — no WiFi restriction
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import Peer from 'peerjs';
import type { DataConnection } from 'peerjs';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api';

// PeerJS config with STUN + TURN servers for cross-network connectivity
const PEERJS_CONFIG = {
    config: {
        iceServers: [
            // STUN servers (discover public IP)
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            // Free TURN servers (relay when direct P2P fails)
            {
                urls: 'turn:openrelay.metered.ca:80',
                username: 'openrelayproject',
                credential: 'openrelayproject',
            },
            {
                urls: 'turn:openrelay.metered.ca:443',
                username: 'openrelayproject',
                credential: 'openrelayproject',
            },
            {
                urls: 'turn:openrelay.metered.ca:443?transport=tcp',
                username: 'openrelayproject',
                credential: 'openrelayproject',
            },
        ],
    },
    debug: 1,
};

export type SessionRole = 'sender' | 'receiver' | null;
export type SessionStatus =
    | 'idle'
    | 'creating'
    | 'waiting'      // sender waiting for receiver
    | 'joining'      // receiver joining
    | 'connecting'   // WebRTC handshake
    | 'connected'
    | 'error';

interface UseP2PSessionReturn {
    // State
    role: SessionRole;
    status: SessionStatus;
    shareCode: string | null;
    connection: DataConnection | null;
    error: string | null;

    // Actions
    createSession: () => Promise<string | null>;
    joinSession: (code: string) => Promise<boolean>;
    disconnect: () => void;
}

export function useP2PSession(): UseP2PSessionReturn {
    const [role, setRole] = useState<SessionRole>(null);
    const [status, setStatus] = useState<SessionStatus>('idle');
    const [shareCode, setShareCode] = useState<string | null>(null);
    const [connection, setConnection] = useState<DataConnection | null>(null);
    const [error, setError] = useState<string | null>(null);

    const peerRef = useRef<Peer | null>(null);
    const shareCodeRef = useRef<string | null>(null);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            cleanup();
        };
    }, []);

    const cleanup = useCallback(() => {
        if (peerRef.current && !peerRef.current.destroyed) {
            peerRef.current.destroy();
            peerRef.current = null;
        }

        // Delete session from server
        if (shareCodeRef.current) {
            fetch(`${API_BASE}/p2p/session/${shareCodeRef.current}`, {
                method: 'DELETE',
            }).catch(() => {});
            shareCodeRef.current = null;
        }

        setConnection(null);
        setShareCode(null);
        setRole(null);
        setStatus('idle');
        setError(null);
    }, []);

    /**
     * SENDER: Create a session and wait for receiver
     */
    const createSession = useCallback(async (): Promise<string | null> => {
        try {
            setRole('sender');
            setStatus('creating');
            setError(null);

            // 1. Initialize PeerJS with random ID
            const peerId = `sa_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
            const peer = new Peer(peerId, PEERJS_CONFIG);

            await new Promise<void>((resolve, reject) => {
                const timeout = setTimeout(() => reject(new Error('Peer initialization timeout')), 15000);
                peer.on('open', () => { clearTimeout(timeout); resolve(); });
                peer.on('error', (err) => { clearTimeout(timeout); reject(err); });
            });

            peerRef.current = peer;

            // 2. Register session on server
            const response = await fetch(`${API_BASE}/p2p/create-session`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ peerId }),
            });

            const data = await response.json();

            if (!data.success) {
                throw new Error(data.error || 'Failed to create session');
            }

            const code = data.data.code;
            setShareCode(code);
            shareCodeRef.current = code;
            setStatus('waiting');

            // 3. Listen for incoming connections
            peer.on('connection', (conn) => {
                conn.on('open', () => {
                    console.log('🤝 Receiver connected!');
                    setConnection(conn);
                    setStatus('connected');
                });

                conn.on('close', () => {
                    console.log('🔌 Connection closed');
                    setConnection(null);
                    setStatus('waiting');
                });

                conn.on('error', (err) => {
                    console.error('Connection error:', err);
                    setError('Connection error');
                    setStatus('error');
                });
            });

            return code;
        } catch (err: any) {
            console.error('Failed to create session:', err);
            setError(err.message || 'Failed to create session');
            setStatus('error');
            return null;
        }
    }, []);

    /**
     * RECEIVER: Join a session by share code
     */
    const joinSession = useCallback(async (code: string): Promise<boolean> => {
        try {
            setRole('receiver');
            setStatus('joining');
            setError(null);

            const upperCode = code.toUpperCase().trim();

            // 1. Get sender's peer ID from server
            const response = await fetch(`${API_BASE}/p2p/join/${upperCode}`);
            const data = await response.json();

            if (!data.success) {
                throw new Error(data.error || 'Session not found');
            }

            const senderPeerId = data.data.peerId;
            setShareCode(upperCode);
            shareCodeRef.current = upperCode;

            // 2. Initialize PeerJS
            const peerId = `sa_recv_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
            const peer = new Peer(peerId, PEERJS_CONFIG);

            await new Promise<void>((resolve, reject) => {
                const timeout = setTimeout(() => reject(new Error('Peer initialization timeout')), 15000);
                peer.on('open', () => { clearTimeout(timeout); resolve(); });
                peer.on('error', (err) => { clearTimeout(timeout); reject(err); });
            });

            peerRef.current = peer;
            setStatus('connecting');

            // 3. Connect to sender
            const conn = peer.connect(senderPeerId, {
                reliable: true,
                serialization: 'binary',
            });

            await new Promise<void>((resolve, reject) => {
                const timeout = setTimeout(() => reject(new Error('Connection timeout')), 30000);

                conn.on('open', () => {
                    clearTimeout(timeout);
                    console.log('🤝 Connected to sender!');
                    setConnection(conn);
                    setStatus('connected');
                    resolve();
                });

                conn.on('error', (err) => {
                    clearTimeout(timeout);
                    reject(err);
                });
            });

            conn.on('close', () => {
                console.log('🔌 Connection closed');
                setConnection(null);
                setStatus('idle');
            });

            return true;
        } catch (err: any) {
            console.error('Failed to join session:', err);
            setError(err.message || 'Failed to join session');
            setStatus('error');
            return false;
        }
    }, []);

    /**
     * Disconnect and cleanup
     */
    const disconnect = useCallback(() => {
        cleanup();
    }, [cleanup]);

    return {
        role,
        status,
        shareCode,
        connection,
        error,
        createSession,
        joinSession,
        disconnect,
    };
}
