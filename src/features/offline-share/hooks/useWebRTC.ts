/**
 * useWebRTC Hook
 * Manages WebRTC peer connections
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type Peer from 'peerjs';
import type { DataConnection } from 'peerjs';
import { toast } from 'sonner';
import type { UseWebRTCReturn } from '../types';
import {
    initializePeer,
    destroyPeer,
    connectToPeer,
    onIncomingConnection,
    disconnectFromPeer,
    getPeer,
} from '../services/webrtcService';

export function useWebRTC(deviceId: string | null): UseWebRTCReturn {
    const [peer, setPeer] = useState<Peer | null>(null);
    const [connection, setConnection] = useState<DataConnection | null>(null);
    const [isConnected, setIsConnected] = useState(false);
    const [isConnecting, setIsConnecting] = useState(false);
    const [connectionError, setConnectionError] = useState<Error | null>(null);

    const incomingConnectionCallbackRef = useRef<((connection: DataConnection) => void) | null>(null);

    // Initialize peer when deviceId is available
    useEffect(() => {
        if (!deviceId) return;

        let mounted = true;

        async function init() {
            try {
                const peerInstance = await initializePeer(deviceId);

                if (mounted) {
                    setPeer(peerInstance);
                }

                // Set up incoming connection handler
                onIncomingConnection((conn) => {
                    if (mounted) {
                        setConnection(conn);
                        setIsConnected(true);

                        // Call user-provided callback if exists
                        if (incomingConnectionCallbackRef.current) {
                            incomingConnectionCallbackRef.current(conn);
                        }

                        // Handle connection close
                        conn.on('close', () => {
                            if (mounted) {
                                setConnection(null);
                                setIsConnected(false);
                            }
                        });
                    }
                });
            } catch (err) {
                console.error('Failed to initialize peer:', err);
                if (mounted) {
                    setConnectionError(err as Error);
                    toast.error('Failed to initialize P2P connection');
                }
            }
        }

        init();

        return () => {
            mounted = false;
            destroyPeer();
            setPeer(null);
            setConnection(null);
            setIsConnected(false);
        };
    }, [deviceId]);

    // Connect to a device
    const connectToDevice = useCallback(async (targetDeviceId: string): Promise<DataConnection> => {
        if (!peer) {
            throw new Error('Peer not initialized');
        }

        setIsConnecting(true);
        setConnectionError(null);

        try {
            const conn = await connectToPeer(targetDeviceId);

            setConnection(conn);
            setIsConnected(true);
            setIsConnecting(false);

            // Handle connection close
            conn.on('close', () => {
                setConnection(null);
                setIsConnected(false);
            });

            return conn;
        } catch (err) {
            console.error('Failed to connect to device:', err);
            setConnectionError(err as Error);
            setIsConnecting(false);
            toast.error('Failed to connect to device');
            throw err;
        }
    }, [peer]);

    // Disconnect from current connection
    const disconnect = useCallback(() => {
        if (connection) {
            disconnectFromPeer(connection.peer);
            setConnection(null);
            setIsConnected(false);
        }
    }, [connection]);

    // Set callback for incoming connections
    const onIncomingConnectionCallback = useCallback((callback: (connection: DataConnection) => void) => {
        incomingConnectionCallbackRef.current = callback;
    }, []);

    return {
        peer,
        connection,
        isConnected,
        isConnecting,
        connectionError,
        connectToDevice,
        disconnect,
        onIncomingConnection: onIncomingConnectionCallback,
    };
}
