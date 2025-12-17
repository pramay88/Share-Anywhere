/**
 * Simplified Transfer Service - State-based approach
 * No complex callbacks, just simple message passing
 */

import type { DataConnection } from 'peerjs';
import type { FileMetadata, TransferMessage, TransferMessageType } from '../types';

const CHUNK_SIZE = 64 * 1024; // 64KB chunks

// ============================================================================
// Sender Side
// ============================================================================

/**
 * Send file - simplified version
 * Just sends the file, receiver handles accept/reject separately
 */
export async function sendFileSimple(
    file: File,
    connection: DataConnection,
    onProgress?: (progress: number, speed: number) => void
): Promise<void> {
    const transferId = `transfer_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Wait for connection to be ready
    if (connection.open) {
        console.log('✅ Connection already open');
    } else {
        console.log('⏳ Waiting for connection to open...');
        await new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Connection timeout')), 10000);
            connection.on('open', () => {
                clearTimeout(timeout);
                resolve();
            });
        });
    }

    // Prepare metadata
    const metadata: FileMetadata = {
        name: file.name,
        size: file.size,
        type: file.type,
        lastModified: file.lastModified,
    };

    // Send transfer request
    const requestMessage: TransferMessage = {
        type: 'request',
        transferId,
        metadata,
        totalChunks: Math.ceil(file.size / CHUNK_SIZE),
    };

    console.log(`📤 Sending transfer request: ${metadata.name}`);
    connection.send(requestMessage);

    // Wait for accept/reject
    const accepted = await waitForResponse(connection, transferId);

    if (!accepted) {
        throw new Error('Transfer rejected by receiver');
    }

    console.log('✅ Transfer accepted, starting file transfer');

    // Send file in chunks
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
    const startTime = Date.now();

    for (let i = 0; i < totalChunks; i++) {
        const start = i * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, file.size);
        const chunk = file.slice(start, end);
        const arrayBuffer = await chunk.arrayBuffer();

        const chunkMessage: TransferMessage = {
            type: 'chunk',
            transferId,
            chunkIndex: i,
            chunkData: arrayBuffer,
        };

        connection.send(chunkMessage);

        // Calculate progress
        const progress = Math.round(((i + 1) / totalChunks) * 100);
        const elapsed = (Date.now() - startTime) / 1000;
        const speed = elapsed > 0 ? ((i + 1) * CHUNK_SIZE) / elapsed : 0;

        if (onProgress) {
            onProgress(progress, speed);
        }
    }

    // Send complete message
    const completeMessage: TransferMessage = {
        type: 'complete',
        transferId,
    };
    connection.send(completeMessage);

    console.log('✅ File transfer complete');
}

/**
 * Wait for accept/reject response
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
                    console.log('✅ Receiver accepted transfer');
                    // Small delay to ensure receiver is ready
                    setTimeout(() => resolve(true), 500);
                } else if (message.type === 'reject') {
                    clearTimeout(timeout);
                    connection.off('data', handler);
                    console.log('❌ Receiver rejected transfer');
                    resolve(false);
                }
            }
        };

        connection.on('data', handler);
    });
}

// ============================================================================
// Receiver Side - Simplified
// ============================================================================

export interface PendingTransfer {
    transferId: string;
    metadata: FileMetadata;
    totalChunks: number;
    connection: DataConnection;
}

/**
 * Listen for incoming transfer requests
 * Returns pending transfer info immediately when request arrives
 */
export function listenForTransferRequest(
    connection: DataConnection,
    onRequest: (pending: PendingTransfer) => void
): void {
    console.log('👂 Listening for transfer requests...');

    connection.on('data', (data: any) => {
        const message = data as TransferMessage;

        if (message.type === 'request' && message.metadata) {
            console.log(`📥 Transfer request received: ${message.metadata.name}`);

            const pending: PendingTransfer = {
                transferId: message.transferId,
                metadata: message.metadata,
                totalChunks: message.totalChunks || 0,
                connection,
            };

            // Call callback immediately - component will show modal
            onRequest(pending);
        }
    });
}

/**
 * Accept a pending transfer
 */
export function acceptTransfer(pending: PendingTransfer): void {
    const acceptMessage: TransferMessage = {
        type: 'accept',
        transferId: pending.transferId,
    };
    pending.connection.send(acceptMessage);
    console.log('✅ Sent accept message');
}

/**
 * Reject a pending transfer
 */
export function rejectTransfer(pending: PendingTransfer): void {
    const rejectMessage: TransferMessage = {
        type: 'reject',
        transferId: pending.transferId,
    };
    pending.connection.send(rejectMessage);
    console.log('❌ Sent reject message');
}

/**
 * Receive file after accepting
 */
export async function receiveFileSimple(
    pending: PendingTransfer,
    onProgress?: (progress: number, speed: number) => void
): Promise<Blob> {
    return new Promise((resolve, reject) => {
        const receivedChunks: ArrayBuffer[] = [];
        const startTime = Date.now();
        let chunksReceived = 0;

        const handler = (data: any) => {
            const message = data as TransferMessage;

            if (message.transferId !== pending.transferId) return;

            try {
                switch (message.type) {
                    case 'chunk':
                        if (message.chunkData && message.chunkIndex !== undefined) {
                            receivedChunks[message.chunkIndex] = message.chunkData;
                            chunksReceived++;

                            // Calculate progress
                            const progress = Math.round((chunksReceived / pending.totalChunks) * 100);
                            const elapsed = (Date.now() - startTime) / 1000;
                            const speed = elapsed > 0 ? (chunksReceived * CHUNK_SIZE) / elapsed : 0;

                            console.log(`📥 Receiving: ${progress}% at ${(speed / (1024 * 1024)).toFixed(2)} MB/s`);

                            if (onProgress) {
                                onProgress(progress, speed);
                            }
                        }
                        break;

                    case 'complete':
                        pending.connection.off('data', handler);

                        // Combine all chunks
                        const blob = new Blob(receivedChunks, { type: pending.metadata.type });
                        console.log('✅ File received successfully');
                        resolve(blob);
                        break;

                    case 'error':
                        pending.connection.off('data', handler);
                        reject(new Error(message.error || 'Transfer error'));
                        break;
                }
            } catch (error) {
                pending.connection.off('data', handler);
                reject(error);
            }
        };

        pending.connection.on('data', handler);
    });
}

// Export helper to trigger download
export function downloadFile(blob: Blob, filename: string): void {
    try {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();

        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 100);

        console.log('✅ Download triggered:', filename);
    } catch (error) {
        console.error('❌ Download failed:', error);
        throw error;
    }
}
