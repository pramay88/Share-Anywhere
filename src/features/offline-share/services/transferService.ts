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
    // Ensure connection is fully open before sending
    if (!connection.open) {
        console.log('⏳ Waiting for connection to open...');
        await new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Connection timeout - not opened in time'));
            }, 10000);

            if (connection.open) {
                clearTimeout(timeout);
                resolve();
            } else {
                connection.on('open', () => {
                    clearTimeout(timeout);
                    resolve();
                });
            }
        });
    }

    const transferId = generateTransferId();

    // Step 1: Send transfer request with file metadata
    console.log('📤 Sending transfer request:', file.name);
    const requestMessage: TransferMessage = {
        type: 'request',
        transferId,
        metadata: {
            name: file.name,
            size: file.size,
            type: file.type,
            lastModified: file.lastModified,
        },
    };

    connection.send(requestMessage);

    // Step 2: Wait for acceptance or rejection
    const accepted = await waitForResponse(connection, transferId);

    if (!accepted) {
        throw new Error('Transfer rejected by receiver');
    }

    console.log('✅ Transfer accepted, starting file transfer');

    // Step 3: Send file chunks
    const chunkSize = DEFAULT_CHUNK_SIZE;
    const totalChunks = Math.ceil(file.size / chunkSize);

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
            totalChunks,
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

    // Step 4: Send completion message
    const completeMessage: TransferMessage = {
        type: 'complete',
        transferId,
    };

    connection.send(completeMessage);
    console.log('✅ File transfer complete');
}

/**
 * Wait for transfer acceptance/rejection from receiver
 */
function waitForResponse(connection: DataConnection, transferId: string): Promise<boolean> {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            connection.off('data', handler);
            reject(new Error('Response timeout - no answer from receiver'));
        }, 30000); // 30 second timeout

        const handler = (data: any) => {
            const message = data as TransferMessage;

            if (message.transferId === transferId) {
                if (message.type === 'accept') {
                    clearTimeout(timeout);
                    connection.off('data', handler);
                    resolve(true);
                } else if (message.type === 'reject') {
                    clearTimeout(timeout);
                    connection.off('data', handler);
                    resolve(false);
                }
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
 * Returns file metadata for display, actual file comes via callback
 */
export async function receiveFile(
    connection: DataConnection,
    onRequest: (metadata: FileMetadata, accept: () => void, reject: () => void) => void,
    onProgress?: (progress: number, speed: number) => void
): Promise<{ file: Blob; metadata: FileMetadata }> {
    return new Promise((resolve, reject) => {
        let metadata: FileMetadata | null = null;
        let totalChunks = 0;
        let receivedChunks: ArrayBuffer[] = [];
        let transferId = '';
        let transferAccepted = false;
        const startTime = Date.now();

        const handler = (data: any) => {
            const message = data as TransferMessage;

            try {
                switch (message.type) {
                    case 'request':
                        // Receive transfer request
                        metadata = message.metadata!;
                        transferId = message.transferId;
                        console.log(`📥 Transfer request: ${metadata.name} (${(metadata.size / 1024 / 1024).toFixed(2)} MB)`);

                        // Call user callback to show accept/reject dialog
                        onRequest(
                            metadata,
                            // Accept callback
                            () => {
                                transferAccepted = true;
                                const acceptMessage: TransferMessage = {
                                    type: 'accept',
                                    transferId,
                                };
                                connection.send(acceptMessage);
                                console.log('✅ Transfer accepted');
                            },
                            // Reject callback
                            () => {
                                transferAccepted = false;
                                const rejectMessage: TransferMessage = {
                                    type: 'reject',
                                    transferId,
                                };
                                connection.send(rejectMessage);
                                connection.off('data', handler);
                                reject(new Error('Transfer rejected by user'));
                                console.log('❌ Transfer rejected');
                            }
                        );
                        break;

                    case 'chunk':
                        // Receive chunk (only if transfer was accepted)
                        if (!transferAccepted) {
                            console.warn('Received chunk but transfer not accepted, ignoring');
                            return;
                        }

                        if (message.chunkIndex !== undefined && message.chunkData) {
                            // Initialize chunks array on first chunk
                            if (receivedChunks.length === 0 && message.totalChunks) {
                                totalChunks = message.totalChunks;
                                receivedChunks = new Array(totalChunks);
                            }

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

                        if (!transferAccepted) {
                            reject(new Error('Transfer completed but was not accepted'));
                            return;
                        }

                        // Assemble file
                        const file = assembleChunks(receivedChunks);
                        console.log('✅ File received successfully');
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
            if (!transferAccepted) {
                reject(new Error('Connection closed before transfer accepted'));
            } else {
                reject(new Error('Connection closed during transfer'));
            }
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
