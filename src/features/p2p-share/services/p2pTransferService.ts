/**
 * P2P Transfer Service
 * Multi-file and folder transfer over WebRTC data channels
 */

import type { DataConnection } from 'peerjs';

const CHUNK_SIZE = 64 * 1024; // 64KB chunks

// ============================================================================
// Types
// ============================================================================

export interface FileEntry {
    file: File;
    relativePath: string; // e.g. "folder/subfolder/file.txt" or just "file.txt"
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

    // batch-request
    metadata?: BatchMetadata;

    // chunk
    fileIndex?: number;
    chunkIndex?: number;
    chunkData?: ArrayBuffer;

    // error
    error?: string;
}

export interface TransferProgress {
    totalFiles: number;
    completedFiles: number;
    currentFileName: string;
    currentFileProgress: number; // 0-100
    overallProgress: number;     // 0-100
    speed: number;               // bytes/sec
    bytesTransferred: number;
    totalBytes: number;
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Convert files from input[type=file] (with webkitdirectory) to FileEntry[]
 */
export function filesToEntries(files: File[] | FileList): FileEntry[] {
    const entries: FileEntry[] = [];

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        // webkitRelativePath gives us the relative path including folder name
        const relativePath = (file as any).webkitRelativePath || file.name;
        entries.push({ file, relativePath });
    }

    return entries;
}

/**
 * Build BatchMetadata from FileEntry[]
 */
export function buildBatchMetadata(entries: FileEntry[], folderName?: string): BatchMetadata {
    const files: FileMetadataEntry[] = entries.map((entry) => ({
        name: entry.file.name,
        size: entry.file.size,
        type: entry.file.type || 'application/octet-stream',
        relativePath: entry.relativePath,
    }));

    const totalSize = files.reduce((sum, f) => sum + f.size, 0);

    return {
        files,
        totalSize,
        totalFiles: files.length,
        folderName,
    };
}

/**
 * Format bytes to human-readable string
 */
export function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// ============================================================================
// Sender
// ============================================================================

/**
 * Send multiple files over a WebRTC connection
 */
export async function sendBatch(
    entries: FileEntry[],
    connection: DataConnection,
    onProgress?: (progress: TransferProgress) => void
): Promise<void> {
    const transferId = `batch_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    const metadata = buildBatchMetadata(entries);

    // Wait for connection to be ready
    if (!connection.open) {
        await new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Connection timeout')), 10000);
            connection.on('open', () => { clearTimeout(timeout); resolve(); });
        });
    }

    // 1. Send batch request
    const requestMsg: P2PMessage = {
        type: 'batch-request',
        transferId,
        metadata,
    };
    connection.send(requestMsg);

    // 2. Wait for accept/reject
    const accepted = await waitForAccept(connection, transferId);
    if (!accepted) {
        throw new Error('Transfer declined by receiver');
    }

    // 3. Send each file
    const startTime = Date.now();
    let totalBytesTransferred = 0;

    for (let fileIdx = 0; fileIdx < entries.length; fileIdx++) {
        const entry = entries[fileIdx];
        const file = entry.file;
        const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

        for (let chunkIdx = 0; chunkIdx < totalChunks; chunkIdx++) {
            const start = chunkIdx * CHUNK_SIZE;
            const end = Math.min(start + CHUNK_SIZE, file.size);
            const chunk = file.slice(start, end);
            const arrayBuffer = await chunk.arrayBuffer();

            const chunkMsg: P2PMessage = {
                type: 'chunk',
                transferId,
                fileIndex: fileIdx,
                chunkIndex: chunkIdx,
                chunkData: arrayBuffer,
            };

            connection.send(chunkMsg);

            totalBytesTransferred += (end - start);

            // Progress
            const elapsed = (Date.now() - startTime) / 1000;
            const speed = elapsed > 0 ? totalBytesTransferred / elapsed : 0;
            const fileProgress = Math.round(((chunkIdx + 1) / totalChunks) * 100);
            const overallProgress = Math.round((totalBytesTransferred / metadata.totalSize) * 100);

            onProgress?.({
                totalFiles: entries.length,
                completedFiles: fileIdx,
                currentFileName: file.name,
                currentFileProgress: fileProgress,
                overallProgress,
                speed,
                bytesTransferred: totalBytesTransferred,
                totalBytes: metadata.totalSize,
            });
        }

        // File complete
        const fileCompleteMsg: P2PMessage = {
            type: 'file-complete',
            transferId,
            fileIndex: fileIdx,
        };
        connection.send(fileCompleteMsg);
    }

    // 4. Batch complete
    const batchCompleteMsg: P2PMessage = {
        type: 'batch-complete',
        transferId,
    };
    connection.send(batchCompleteMsg);
}

function waitForAccept(connection: DataConnection, transferId: string): Promise<boolean> {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            connection.off('data', handler);
            reject(new Error('No response from receiver (30s timeout)'));
        }, 30000);

        const handler = (data: unknown) => {
            const msg = data as P2PMessage;
            if (msg.transferId !== transferId) return;

            if (msg.type === 'accept') {
                clearTimeout(timeout);
                connection.off('data', handler);
                setTimeout(() => resolve(true), 300); // small delay for receiver readiness
            } else if (msg.type === 'reject') {
                clearTimeout(timeout);
                connection.off('data', handler);
                resolve(false);
            }
        };

        connection.on('data', handler);
    });
}

// ============================================================================
// Receiver
// ============================================================================

export interface PendingBatchTransfer {
    transferId: string;
    metadata: BatchMetadata;
    connection: DataConnection;
}

/**
 * Listen for incoming batch transfer requests
 */
export function listenForBatchRequest(
    connection: DataConnection,
    onRequest: (pending: PendingBatchTransfer) => void
): () => void {
    const handler = (data: unknown) => {
        const msg = data as P2PMessage;

        if (msg.type === 'batch-request' && msg.metadata) {
            onRequest({
                transferId: msg.transferId,
                metadata: msg.metadata,
                connection,
            });
        }
    };

    connection.on('data', handler);

    // Return cleanup function
    return () => connection.off('data', handler);
}

/**
 * Accept a pending batch transfer
 */
export function acceptBatchTransfer(pending: PendingBatchTransfer): void {
    const msg: P2PMessage = {
        type: 'accept',
        transferId: pending.transferId,
    };
    pending.connection.send(msg);
}

/**
 * Reject a pending batch transfer
 */
export function rejectBatchTransfer(pending: PendingBatchTransfer): void {
    const msg: P2PMessage = {
        type: 'reject',
        transferId: pending.transferId,
    };
    pending.connection.send(msg);
}

/**
 * Receive all files after accepting
 * Returns an array of { blob, metadata } for each file
 */
export async function receiveBatch(
    pending: PendingBatchTransfer,
    onProgress?: (progress: TransferProgress) => void
): Promise<{ blob: Blob; metadata: FileMetadataEntry }[]> {
    return new Promise((resolve, reject) => {
        const { metadata, connection, transferId } = pending;
        const startTime = Date.now();
        let totalBytesReceived = 0;
        let completedFiles = 0;

        // Pre-allocate storage for each file's chunks
        const fileChunks: ArrayBuffer[][] = metadata.files.map(() => []);

        const results: { blob: Blob; metadata: FileMetadataEntry }[] = [];

        const handler = (data: unknown) => {
            const msg = data as P2PMessage;
            if (msg.transferId !== transferId) return;

            try {
                switch (msg.type) {
                    case 'chunk': {
                        const fIdx = msg.fileIndex!;
                        const cIdx = msg.chunkIndex!;
                        const chunkData = msg.chunkData!;

                        fileChunks[fIdx][cIdx] = chunkData;
                        totalBytesReceived += chunkData.byteLength;

                        // Progress
                        const elapsed = (Date.now() - startTime) / 1000;
                        const speed = elapsed > 0 ? totalBytesReceived / elapsed : 0;
                        const fileMeta = metadata.files[fIdx];
                        const totalFileChunks = Math.ceil(fileMeta.size / CHUNK_SIZE);
                        const fileProgress = Math.round(((cIdx + 1) / totalFileChunks) * 100);
                        const overallProgress = Math.round((totalBytesReceived / metadata.totalSize) * 100);

                        onProgress?.({
                            totalFiles: metadata.totalFiles,
                            completedFiles,
                            currentFileName: fileMeta.name,
                            currentFileProgress: fileProgress,
                            overallProgress,
                            speed,
                            bytesTransferred: totalBytesReceived,
                            totalBytes: metadata.totalSize,
                        });
                        break;
                    }

                    case 'file-complete': {
                        const fIdx = msg.fileIndex!;
                        const fileMeta = metadata.files[fIdx];
                        const blob = new Blob(fileChunks[fIdx], { type: fileMeta.type });
                        results.push({ blob, metadata: fileMeta });
                        completedFiles++;
                        break;
                    }

                    case 'batch-complete': {
                        connection.off('data', handler);
                        resolve(results);
                        break;
                    }

                    case 'error': {
                        connection.off('data', handler);
                        reject(new Error(msg.error || 'Transfer error'));
                        break;
                    }
                }
            } catch (err) {
                connection.off('data', handler);
                reject(err);
            }
        };

        connection.on('data', handler);
    });
}

/**
 * Trigger download of a single file
 */
export function downloadSingleFile(blob: Blob, filename: string): void {
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
}

/**
 * Download all received files
 * For multiple files: downloads each individually
 * For folders: could be enhanced to create a zip
 */
export function downloadAllFiles(
    results: { blob: Blob; metadata: FileMetadataEntry }[]
): void {
    for (const result of results) {
        downloadSingleFile(result.blob, result.metadata.name);
    }
}
