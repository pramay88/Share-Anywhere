/**
 * WebRTC Service - Manages peer connections using PeerJS
 * Supports scalable architecture for multi-receiver connections
 */

import Peer, { DataConnection } from 'peerjs';
import type { ConnectionPool, PeerConnection, ConnectionStatus } from '../types';

// PeerJS configuration - Using official PeerJS cloud server
const PEERJS_CONFIG = {
    // Use PeerJS cloud server (free, reliable)
    // Alternative: host your own PeerJS server for production
    config: {
        iceServers: [
            // Google STUN servers
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' },
            { urls: 'stun:stun3.l.google.com:19302' },
            { urls: 'stun:stun4.l.google.com:19302' },
        ],
    },
    // Enable debug for troubleshooting (disable in production)
    debug: 2,
};

// ============================================================================
// Peer Instance Management
// ============================================================================

let peerInstance: Peer | null = null;
let connectionPool: ConnectionPool = {};

/**
 * Initialize PeerJS instance
 */
export async function initializePeer(deviceId: string): Promise<Peer> {
    // Return existing instance if already initialized
    if (peerInstance && !peerInstance.destroyed) {
        return peerInstance;
    }

    return new Promise((resolve, reject) => {
        const peer = new Peer(deviceId, PEERJS_CONFIG);

        peer.on('open', (id) => {
            console.log('Peer initialized with ID:', id);
            peerInstance = peer;
            resolve(peer);
        });

        peer.on('error', (error) => {
            console.error('Peer error:', error);
            reject(error);
        });

        peer.on('disconnected', () => {
            console.warn('Peer disconnected, attempting to reconnect...');
            peer.reconnect();
        });
    });
}

/**
 * Get current peer instance
 */
export function getPeer(): Peer | null {
    return peerInstance;
}

/**
 * Destroy peer instance
 */
export function destroyPeer(): void {
    if (peerInstance) {
        // Close all connections
        Object.values(connectionPool).forEach(({ connection }) => {
            connection.close();
        });

        connectionPool = {};
        peerInstance.destroy();
        peerInstance = null;
    }
}

// ============================================================================
// Connection Management
// ============================================================================

/**
 * Connect to a peer device
 */
export async function connectToPeer(
    targetDeviceId: string,
    timeout: number = 30000
): Promise<DataConnection> {
    if (!peerInstance) {
        throw new Error('Peer not initialized. Call initializePeer first.');
    }

    // Check if already connected
    const existing = connectionPool[targetDeviceId];
    if (existing && existing.status === 'connected') {
        return existing.connection;
    }

    return new Promise((resolve, reject) => {
        const connection = peerInstance!.connect(targetDeviceId, {
            reliable: true,
            serialization: 'binary',
        });

        // Add to connection pool
        connectionPool[targetDeviceId] = {
            deviceId: targetDeviceId,
            connection,
            status: 'connecting',
            lastActivity: new Date(),
        };

        // Set timeout
        const timeoutId = setTimeout(() => {
            connection.close();
            delete connectionPool[targetDeviceId];
            reject(new Error(`Connection timeout after ${timeout}ms`));
        }, timeout);

        connection.on('open', () => {
            clearTimeout(timeoutId);
            console.log('Connected to peer:', targetDeviceId);

            // Update connection pool
            if (connectionPool[targetDeviceId]) {
                connectionPool[targetDeviceId].status = 'connected';
                connectionPool[targetDeviceId].lastActivity = new Date();
            }

            resolve(connection);
        });

        connection.on('error', (error) => {
            clearTimeout(timeoutId);
            console.error('Connection error:', error);
            delete connectionPool[targetDeviceId];
            reject(error);
        });

        connection.on('close', () => {
            console.log('Connection closed:', targetDeviceId);
            delete connectionPool[targetDeviceId];
        });
    });
}

/**
 * Handle incoming connections
 */
export function onIncomingConnection(
    callback: (connection: DataConnection, deviceId: string) => void
): void {
    if (!peerInstance) {
        throw new Error('Peer not initialized. Call initializePeer first.');
    }

    peerInstance.on('connection', (connection) => {
        const deviceId = connection.peer;
        console.log('Incoming connection from:', deviceId);

        // Add to connection pool
        connectionPool[deviceId] = {
            deviceId,
            connection,
            status: 'connecting',
            lastActivity: new Date(),
        };

        connection.on('open', () => {
            console.log('Incoming connection opened:', deviceId);

            // Update connection pool
            if (connectionPool[deviceId]) {
                connectionPool[deviceId].status = 'connected';
                connectionPool[deviceId].lastActivity = new Date();
            }

            callback(connection, deviceId);
        });

        connection.on('close', () => {
            console.log('Incoming connection closed:', deviceId);
            delete connectionPool[deviceId];
        });

        connection.on('error', (error) => {
            console.error('Incoming connection error:', error);
            delete connectionPool[deviceId];
        });
    });
}

/**
 * Disconnect from a peer
 */
export function disconnectFromPeer(deviceId: string): void {
    const peerConnection = connectionPool[deviceId];

    if (peerConnection) {
        peerConnection.connection.close();
        delete connectionPool[deviceId];
    }
}

/**
 * Disconnect from all peers
 */
export function disconnectAll(): void {
    Object.keys(connectionPool).forEach((deviceId) => {
        disconnectFromPeer(deviceId);
    });
}

/**
 * Get connection status for a device
 */
export function getConnectionStatus(deviceId: string): ConnectionStatus {
    const peerConnection = connectionPool[deviceId];
    return peerConnection?.status || 'disconnected';
}

/**
 * Get active connection for a device
 */
export function getConnection(deviceId: string): DataConnection | null {
    const peerConnection = connectionPool[deviceId];
    return peerConnection?.connection || null;
}

/**
 * Get all active connections
 */
export function getAllConnections(): ConnectionPool {
    return { ...connectionPool };
}

// ============================================================================
// Multi-Receiver Support (Future)
// ============================================================================

/**
 * Connect to multiple peers sequentially
 * Returns array of successful connections
 */
export async function connectToMultiplePeers(
    deviceIds: string[],
    timeout: number = 30000
): Promise<Map<string, DataConnection>> {
    const connections = new Map<string, DataConnection>();

    for (const deviceId of deviceIds) {
        try {
            const connection = await connectToPeer(deviceId, timeout);
            connections.set(deviceId, connection);
        } catch (error) {
            console.error(`Failed to connect to ${deviceId}:`, error);
            // Continue with next device
        }
    }

    return connections;
}

/**
 * Connect to multiple peers in parallel
 * Faster but may overwhelm network
 */
export async function connectToMultiplePeersParallel(
    deviceIds: string[],
    timeout: number = 30000
): Promise<Map<string, DataConnection>> {
    const connectionPromises = deviceIds.map(async (deviceId) => {
        try {
            const connection = await connectToPeer(deviceId, timeout);
            return { deviceId, connection };
        } catch (error) {
            console.error(`Failed to connect to ${deviceId}:`, error);
            return null;
        }
    });

    const results = await Promise.all(connectionPromises);
    const connections = new Map<string, DataConnection>();

    results.forEach((result) => {
        if (result) {
            connections.set(result.deviceId, result.connection);
        }
    });

    return connections;
}

// ============================================================================
// Connection Health Monitoring
// ============================================================================

/**
 * Check if connection is still alive
 */
export function isConnectionAlive(deviceId: string): boolean {
    const peerConnection = connectionPool[deviceId];

    if (!peerConnection) return false;
    if (peerConnection.status !== 'connected') return false;

    // Check if connection is still open
    return peerConnection.connection.open;
}

/**
 * Clean up stale connections
 */
export function cleanupStaleConnections(maxIdleMs: number = 60000): void {
    const now = new Date();

    Object.entries(connectionPool).forEach(([deviceId, peerConnection]) => {
        const idleTime = now.getTime() - peerConnection.lastActivity.getTime();

        if (idleTime > maxIdleMs) {
            console.log(`Cleaning up stale connection: ${deviceId}`);
            peerConnection.connection.close();
            delete connectionPool[deviceId];
        }
    });
}

/**
 * Update connection activity timestamp
 */
export function updateConnectionActivity(deviceId: string): void {
    const peerConnection = connectionPool[deviceId];

    if (peerConnection) {
        peerConnection.lastActivity = new Date();
    }
}
