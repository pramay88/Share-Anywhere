/**
 * TypeScript types and interfaces for Offline Share feature
 * Designed to be scalable for future multi-receiver and broadcast features
 */

import { Timestamp } from 'firebase/firestore';
import type Peer from 'peerjs';
import type { DataConnection } from 'peerjs';

// ============================================================================
// Device Types
// ============================================================================

export type DeviceStatus = 'online' | 'busy' | 'offline';

export interface Device {
    id: string;
    name: string;
    status: DeviceStatus;
    networkFingerprint: string;
    lastSeen: Timestamp;
    // Future extensibility
    groups?: string[];
    isFavorite?: boolean;
    deviceType?: 'desktop' | 'mobile' | 'tablet';
}

export interface DevicePresence {
    deviceId: string;
    deviceName: string;
    networkFingerprint: string;
    status: DeviceStatus;
    lastHeartbeat: Timestamp;
    createdAt: Timestamp;
}

// ============================================================================
// Transfer Types
// ============================================================================

export type TransferStatus =
    | 'idle'
    | 'pending'
    | 'connecting'
    | 'transferring'
    | 'complete'
    | 'error'
    | 'cancelled';

export interface FileMetadata {
    name: string;
    size: number;
    type: string;
    lastModified: number;
}

export interface Transfer {
    id: string;
    senderId: string;
    senderName: string;
    receiverIds: string[]; // Array for multi-receiver support
    file: FileMetadata;
    status: TransferStatus;
    progress: number; // 0-100
    speed: number; // bytes/sec
    startedAt: Date;
    completedAt?: Date;
    error?: string;
    // Future extensibility
    priority?: number;
    retryCount?: number;
    chunkSize?: number;
}

export interface TransferProgress {
    receiverId: string;
    progress: number; // 0-100
    speed: number; // bytes/sec
    bytesTransferred: number;
    totalBytes: number;
}

// ============================================================================
// WebRTC Types
// ============================================================================

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'failed';

export interface PeerConnection {
    deviceId: string;
    connection: DataConnection;
    status: ConnectionStatus;
    lastActivity: Date;
}

export interface ConnectionPool {
    [deviceId: string]: PeerConnection;
}

export interface WebRTCSignal {
    id: string;
    fromDeviceId: string;
    toDeviceId: string;
    type: 'offer' | 'answer' | 'ice-candidate';
    data: any;
    createdAt: Timestamp;
}

// ============================================================================
// Transfer Protocol Types
// ============================================================================

export type TransferMessageType =
    | 'metadata'
    | 'chunk'
    | 'accept'
    | 'decline'
    | 'ack'
    | 'complete'
    | 'error'
    | 'cancel';

export interface TransferMessage {
    type: TransferMessageType;
    transferId: string;

    // For metadata
    metadata?: FileMetadata;
    totalChunks?: number;

    // For chunks
    chunkIndex?: number;
    chunkData?: ArrayBuffer;

    // For ack/error/cancel
    message?: string;
    error?: string;
}

export interface ChunkInfo {
    index: number;
    size: number;
    data: ArrayBuffer;
}

// ============================================================================
// Hook Return Types
// ============================================================================

export interface UseDeviceDiscoveryReturn {
    devices: Device[];
    myDevice: Device | null;
    isRegistered: boolean;
    isLoading: boolean;
    error: Error | null;
    updateDeviceName: (name: string) => Promise<void>;
    refreshDevices: () => Promise<void>;
    setStatus: (status: DeviceStatus) => Promise<void>;
}

export interface UseWebRTCReturn {
    peer: Peer | null;
    connection: DataConnection | null;
    isConnected: boolean;
    isConnecting: boolean;
    connectionError: Error | null;
    connectToDevice: (deviceId: string) => Promise<DataConnection>;
    disconnect: () => void;
    onIncomingConnection: (callback: (connection: DataConnection) => void) => void;
}

export interface UseFileTransferReturn {
    sendFile: (file: File, connection: DataConnection) => Promise<void>;
    receiveFile: (connection: DataConnection) => Promise<Blob>;
    progress: number;
    speed: number;
    status: TransferStatus;
    error: Error | null;
    cancel: () => void;
    // Multi-receiver support
    sendToMultiple?: (file: File, targetDeviceIds: string[]) => Promise<void>;
    progressByReceiver?: Map<string, TransferProgress>;
}

// ============================================================================
// Service Configuration
// ============================================================================

export interface OfflineShareConfig {
    chunkSize: number; // Default: 64KB
    heartbeatInterval: number; // Default: 5000ms
    deviceTimeout: number; // Default: 15000ms
    maxRetries: number; // Default: 3
    connectionTimeout: number; // Default: 30000ms
}

export const DEFAULT_CONFIG: OfflineShareConfig = {
    chunkSize: 64 * 1024, // 64KB
    heartbeatInterval: 5000, // 5 seconds
    deviceTimeout: 15000, // 15 seconds
    maxRetries: 3,
    connectionTimeout: 30000, // 30 seconds
};

// ============================================================================
// Event Types
// ============================================================================

export interface TransferEvent {
    type: 'start' | 'progress' | 'complete' | 'error' | 'cancel';
    transfer: Transfer;
    progress?: TransferProgress;
    error?: Error;
}

export type TransferEventCallback = (event: TransferEvent) => void;

// ============================================================================
// Device Group Types (Future Feature)
// ============================================================================

export interface DeviceGroup {
    id: string;
    name: string;
    deviceIds: string[];
    createdAt: Date;
    updatedAt: Date;
}
