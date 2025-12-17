/**
 * Transfer Service - Handles file chunking, transfer, and assembly
 * Supports scalable architecture for sequential multi-receiver transfers
 */

import type { DataConnection } from 'peerjs';
import type {
    FileMetadata,
    TransferMessage,
    ChunkInfo,
    TransferProgress,
} from '../types';
import { updateConnectionActivity } from './webrtcService';

const DEFAULT_CHUNK_SIZE = 64 * 1024; // 64KB - optimal for WebRTC

// ============================================================================
// File Chunking
// ============================================================================

/**
 * Split file into chunks
 */
export function chunkFile(file: File, chunkSize: number = DEFAULT_CHUNK_SIZE): ChunkInfo[] {
    const chunks: ChunkInfo[] = [];
    let offset = 0;
    let index = 0;

    while (offset < file.size) {
        const end = Math.min(offset + chunkSize, file.size);
        const blob = file.slice(offset, end);

        chunks.push({
            index,
            size: blob.size,
            data: new ArrayBuffer(0), // Will be filled when reading
        });

        offset = end;
        index++;
    }

    return chunks;
}

/**
 * Read file chunk as ArrayBuffer
 */
async function readChunk(blob: Blob): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = () => {
            resolve(reader.result as ArrayBuffer);
        };

        reader.onerror = () => {
            reject(reader.error);
        };

        reader.readAsArrayBuffer(blob);
    });
}

/**
 * Assemble chunks into a Blob
 */
export function assembleChunks(chunks: ArrayBuffer[]): Blob {
    return new Blob(chunks);
}

// ============================================================================
// File Transfer (Sender)
// ============================================================================

/**
 * Send file over WebRTC connection
 */
export async function sendFile(
    connection: DataConnection,
    file: File,
    onProgress?: (progress: number, speed: number) => void
): Promise<void> {
    const transferId = generateTransferId();
    const chunkSize = DEFAULT_CHUNK_SIZE;
    const totalChunks = Math.ceil(file.size / chunkSize);

    // Send metadata first
    const metadata: FileMetadata = {
        name: file.name,
        size: file.size,
        type: file.type,
        lastModified: file.lastModified,
    };

    const metadataMessage: TransferMessage = {
        type: 'metadata',
        transferId,
        metadata,
        totalChunks,
    };

    connection.send(metadataMessage);

    // Wait for receiver to be ready
    await waitForAck(connection, transferId);

    // Send chunks
    let offset = 0;
    let chunkIndex = 0;
    const startTime = Date.now();

    while (offset < file.size) {
        const end = Math.min(offset + chunkSize, file.size);
        const blob = file.slice(offset, end);
        const chunkData = await readChunk(blob);

        const chunkMessage: TransferMessage = {
            type: 'chunk',
            transferId,
            chunkIndex,
            chunkData,
        };

        connection.send(chunkMessage);

        // Update activity
        updateConnectionActivity(connection.peer);

        // Calculate progress and speed
        offset = end;
        chunkIndex++;

        if (onProgress) {
            const progress = Math.round((offset / file.size) * 100);
            const elapsed = (Date.now() - startTime) / 1000; // seconds
            const speed = elapsed > 0 ? offset / elapsed : 0; // bytes/sec

            onProgress(progress, speed);
        }

        // Small delay to prevent overwhelming the connection
        await new Promise((resolve) => setTimeout(resolve, 1));
    }

    // Send completion message
    const completeMessage: TransferMessage = {
        type: 'complete',
        transferId,
    };

    connection.send(completeMessage);
}

/**
 * Wait for acknowledgment from receiver
 */
function waitForAck(connection: DataConnection, transferId: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            reject(new Error('ACK timeout'));
        }, 10000);

        const handler = (data: any) => {
            if (data.type === 'ack' && data.transferId === transferId) {
                clearTimeout(timeout);
                connection.off('data', handler);
                resolve();
            }
        };

        connection.on('data', handler);
    });
}

// ============================================================================
// File Transfer (Receiver)
// ============================================================================

/**
 * Receive file over WebRTC connection
 */
export async function receiveFile(
    connection: DataConnection,
    onProgress?: (progress: number, speed: number) => void
): Promise<{ file: Blob; metadata: FileMetadata }> {
    return new Promise((resolve, reject) => {
        let metadata: FileMetadata | null = null;
        let totalChunks = 0;
        let receivedChunks: ArrayBuffer[] = [];
        let transferId = '';
        const startTime = Date.now();

        const handler = (data: any) => {
            const message = data as TransferMessage;

            try {
                switch (message.type) {
                    case 'metadata':
                        // Receive metadata
                        metadata = message.metadata!;
                        totalChunks = message.totalChunks!;
                        transferId = message.transferId;
                        receivedChunks = new Array(totalChunks);

                        // Send ACK
                        const ackMessage: TransferMessage = {
                            type: 'ack',
                            transferId,
                        };
                        connection.send(ackMessage);
                        break;

                    case 'chunk':
                        // Receive chunk
                        if (message.chunkIndex !== undefined && message.chunkData) {
                            receivedChunks[message.chunkIndex] = message.chunkData;

                            // Update activity
                            updateConnectionActivity(connection.peer);

                            // Calculate progress
                            if (onProgress && metadata) {
                                const chunksReceived = receivedChunks.filter(Boolean).length;
                                const progress = Math.round((chunksReceived / totalChunks) * 100);
                                const elapsed = (Date.now() - startTime) / 1000;
                                const bytesReceived = chunksReceived * DEFAULT_CHUNK_SIZE;
                                const speed = elapsed > 0 ? bytesReceived / elapsed : 0;

                                onProgress(progress, speed);
                            }
                        }
                        break;

                    case 'complete':
                        // Transfer complete
                        connection.off('data', handler);

                        if (!metadata) {
                            reject(new Error('No metadata received'));
                            return;
                        }

                        // Assemble file
                        const file = assembleChunks(receivedChunks);
                        resolve({ file, metadata });
                        break;

                    case 'error':
                        connection.off('data', handler);
                        reject(new Error(message.error || 'Transfer error'));
                        break;

                    case 'cancel':
                        connection.off('data', handler);
                        reject(new Error('Transfer cancelled by sender'));
                        break;
                }
            } catch (error) {
                connection.off('data', handler);
                reject(error);
            }
        };

        connection.on('data', handler);

        // Timeout after 5 minutes of inactivity
        const timeout = setTimeout(() => {
            connection.off('data', handler);
            reject(new Error('Transfer timeout'));
        }, 5 * 60 * 1000);

        connection.on('close', () => {
            clearTimeout(timeout);
            connection.off('data', handler);
            reject(new Error('Connection closed during transfer'));
        });
    });
}

// ============================================================================
// Multi-Receiver Support (Future)
// ============================================================================

/**
 * Send file to multiple receivers sequentially
 */
export async function sendToMultipleReceivers(
    connections: Map<string, DataConnection>,
    file: File,
    onProgress?: (receiverId: string, progress: number, speed: number) => void
): Promise<Map<string, boolean>> {
    const results = new Map<string, boolean>();

    for (const [deviceId, connection] of connections.entries()) {
        try {
            await sendFile(connection, file, (progress, speed) => {
                if (onProgress) {
                    onProgress(deviceId, progress, speed);
                }
            });
            results.set(deviceId, true);
        } catch (error) {
            console.error(`Failed to send to ${deviceId}:`, error);
            results.set(deviceId, false);
        }
    }

    return results;
}

/**
 * Send file to multiple receivers in parallel (broadcast mode)
 */
export async function broadcastFile(
    connections: Map<string, DataConnection>,
    file: File,
    onProgress?: (receiverId: string, progress: number, speed: number) => void
): Promise<Map<string, boolean>> {
    const sendPromises = Array.from(connections.entries()).map(
        async ([deviceId, connection]) => {
            try {
                await sendFile(connection, file, (progress, speed) => {
                    if (onProgress) {
                        onProgress(deviceId, progress, speed);
                    }
                });
                return { deviceId, success: true };
            } catch (error) {
                console.error(`Failed to send to ${deviceId}:`, error);
                return { deviceId, success: false };
            }
        }
    );

    const results = await Promise.all(sendPromises);
    const resultMap = new Map<string, boolean>();

    results.forEach(({ deviceId, success }) => {
        resultMap.set(deviceId, success);
    });

    return resultMap;
}

// ============================================================================
// Transfer Control
// ============================================================================

/**
 * Cancel ongoing transfer
 */
export function cancelTransfer(connection: DataConnection, transferId: string): void {
    const cancelMessage: TransferMessage = {
        type: 'cancel',
        transferId,
        message: 'Transfer cancelled by user',
    };

    connection.send(cancelMessage);
}

/**
 * Send error message
 */
export function sendError(
    connection: DataConnection,
    transferId: string,
    error: string
): void {
    const errorMessage: TransferMessage = {
        type: 'error',
        transferId,
        error,
    };

    connection.send(errorMessage);
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Generate unique transfer ID
 */
function generateTransferId(): string {
    return `transfer_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Calculate estimated time remaining
 */
export function calculateETA(
    bytesTransferred: number,
    totalBytes: number,
    speed: number
): number {
    if (speed === 0) return 0;

    const remaining = totalBytes - bytesTransferred;
    return Math.round(remaining / speed); // seconds
}

/**
 * Format transfer speed for display
 */
export function formatSpeed(bytesPerSecond: number): string {
    if (bytesPerSecond < 1024) {
        return `${bytesPerSecond.toFixed(0)} B/s`;
    } else if (bytesPerSecond < 1024 * 1024) {
        return `${(bytesPerSecond / 1024).toFixed(1)} KB/s`;
    } else {
        return `${(bytesPerSecond / (1024 * 1024)).toFixed(1)} MB/s`;
    }
}

/**
 * Format time for display
 */
export function formatTime(seconds: number): string {
    if (seconds < 60) {
        return `${seconds}s`;
    } else if (seconds < 3600) {
        const minutes = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${minutes}m ${secs}s`;
    } else {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        return `${hours}h ${minutes}m`;
    }
}
