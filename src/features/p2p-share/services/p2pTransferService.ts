/**
 * P2P Transfer Service — v5
 *
 * Design:
 *  - 16 KB universal chunk size (safe on mobile, TURN relay, and direct LAN)
 *  - Backpressure: HIGH_WATER=128KB pause, LOW_THRESHOLD=16KB resume
 *    (LOW > 0 keeps one chunk always in-flight so SCTP never idles)
 *  - Per-file SHA-256 integrity via SubtleCrypto
 *  - Cancellation via AbortSignal on both sides
 *  - Connection-drop detection, idle timeout, settled-once guard
 *  - Progress throttled via requestAnimationFrame
 */

import type { DataConnection } from 'peerjs';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * 16 KB universal chunk size.
 *
 * Previously used 64 KB (direct) / 16 KB (relay) with runtime detection,
 * but detection relied on PeerJS internals (_pc / peerConnection) that are
 * mangled by Vite's production minifier — always returned 'unknown', falling
 * back to 64 KB chunks with BUFFER_LOW_THRESHOLD=0, causing a full stop-start
 * on every chunk and ~100 KB/s on production even on same-WiFi.
 *
 * 16 KB works correctly everywhere without any detection:
 *  - Same-WiFi: reaches 5+ MB/s (more chunks, negligible overhead per chunk)
 *  - Mobile: well within mobile SCTP buffer limits (~256 KB)
 *  - TURN relay: under typical relay MTU, minimises retransmit cost
 */
const CHUNK_SIZE = 16 * 1024; // 16 KB

/**
 * Backpressure window.
 *
 * HIGH_WATER (128 KB = 8 chunks): pause sending when bufferedAmount exceeds this.
 * LOW_THRESHOLD (16 KB = 1 chunk): resume sending once buffer drains below this.
 *
 * LOW_THRESHOLD must NOT be 0. Draining to zero waits for the OS to fully
 * flush each chunk before sending the next — a full RTT stall per chunk.
 * Keeping one chunk worth of data as the threshold ensures SCTP never idles.
 */
const BUFFER_HIGH_WATER = CHUNK_SIZE * 8; // 128 KB
const BUFFER_LOW_THRESHOLD = CHUNK_SIZE * 1; //  16 KB

const ACCEPT_TIMEOUT_MS = 30_000;
const RECEIVE_IDLE_TIMEOUT_MS = 60_000;

// ---------------------------------------------------------------------------
// Logging — silent in production
// ---------------------------------------------------------------------------

const isDev = typeof import.meta !== 'undefined' && Boolean((import.meta as { env?: { DEV?: boolean } }).env?.DEV === true);
const log = {
    warn: (...a: unknown[]) => isDev && console.warn('[P2P]', ...a),
    error: (...a: unknown[]) => isDev && console.error('[P2P]', ...a),
};

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface FileEntry {
    file: File;
    /** e.g. "folder/sub/file.txt" or just "file.txt" */
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
    currentFileProgress: number; // 0-100
    overallProgress: number;     // 0-100
    speed: number;               // bytes/sec
    bytesTransferred: number;
    totalBytes: number;
    eta: number;                 // seconds remaining
}

export interface PendingBatchTransfer {
    transferId: string;
    metadata: BatchMetadata;
    connection: DataConnection;
}

export interface ReceivedFile {
    blob: Blob;
    metadata: FileMetadataEntry;
    /** true if SHA-256 matched, or sender did not send a hash */
    integrityOk: boolean;
}

// ---------------------------------------------------------------------------
// Public helpers
// ---------------------------------------------------------------------------

export function filesToEntries(files: File[] | FileList): FileEntry[] {
    const entries: FileEntry[] = [];
    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const relativePath = 'webkitRelativePath' in file ? ((file as File & { webkitRelativePath?: string }).webkitRelativePath ?? file.name) : file.name;
        entries.push({ file, relativePath });
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
    if (!isFinite(seconds) || seconds <= 0) return '-';
    if (seconds < 60) return `${Math.round(seconds)}s`;
    return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function sha256Hex(buffer: ArrayBuffer): Promise<string> {
    const digest = await crypto.subtle.digest('SHA-256', buffer);
    return Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
}

function concatBuffers(chunks: ArrayBuffer[]): ArrayBuffer {
    const total = chunks.reduce((s, c) => s + c.byteLength, 0);
    const out = new Uint8Array(total);
    let offset = 0;
    for (const c of chunks) {
        out.set(new Uint8Array(c), offset);
        offset += c.byteLength;
    }
    return out.buffer;
}

/**
 * Safely find the underlying RTCDataChannel from a PeerJS DataConnection.
 * Tries all known property names then falls back to a full key scan so it
 * survives production minification where _dc becomes a single letter.
 */
type PeerJsConnectionLike = DataConnection & {
    dataChannel?: RTCDataChannel | null;
    _dc?: RTCDataChannel | null;
    _channel?: RTCDataChannel | null;
    channel?: RTCDataChannel | null;
    peerConnection?: RTCPeerConnection | null;
    _pc?: RTCPeerConnection | null;
    _peerConnection?: RTCPeerConnection | null;
    [key: string]: unknown;
};

function getRTCDataChannel(conn: DataConnection): RTCDataChannel | null {
    const c = conn as PeerJsConnectionLike;
    for (const candidate of [c.dataChannel, c._dc, c._channel, c.channel]) {
        if (candidate instanceof RTCDataChannel) return candidate;
    }
    for (const key of Object.keys(c)) {
        const value = c[key];
        if (value instanceof RTCDataChannel) return value;
    }
    return null;
}

/**
 * Set bufferedAmountLowThreshold before each send loop.
 * Called once per file so the threshold is always live, even after
 * the DataChannel was quiet between files.
 */
function primeDataChannel(conn: DataConnection): void {
    const dc = getRTCDataChannel(conn);
    if (dc) dc.bufferedAmountLowThreshold = BUFFER_LOW_THRESHOLD;
}

/**
 * Pause sending when the DataChannel buffer hits the high-water mark.
 * Resumes via the native bufferedamountlow event (set by primeDataChannel).
 * A 5s safety timeout ensures a silently-closed channel never hangs the loop.
 */
function waitForDrain(conn: DataConnection): Promise<void> {
    const dc = getRTCDataChannel(conn);
    if (!dc || dc.bufferedAmount < BUFFER_HIGH_WATER) return Promise.resolve();

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
                rafId = requestAnimationFrame(() => {
                    rafId = null;
                    if (latest) cb(latest);
                });
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
        try {
            connection.send({ type: 'cancel', transferId, error: 'Cancelled by sender' } satisfies P2PMessage);
        } catch { /* connection may already be closed */ }
    });

    // Arm accept listener BEFORE sending batch-request — avoids the race where
    // a fast receiver sends 'accept' before we start listening for it.
    const acceptPromise = waitForAccept(connection, transferId, signal);
    connection.send({ type: 'batch-request', transferId, metadata } satisfies P2PMessage);

    const accepted = await acceptPromise;
    if (!accepted) throw new Error('Transfer declined by receiver');

    const startTime = Date.now();
    let totalBytesTransferred = 0;

    for (let fileIdx = 0; fileIdx < entries.length; fileIdx++) {
        signal?.throwIfAborted();

        const { file } = entries[fileIdx];
        const totalChunks = Math.ceil(file.size / CHUNK_SIZE) || 1;

        // Single read — reuse buffer for both chunking and hashing
        const fullBuffer = await file.arrayBuffer();
        const integrityPromise = sha256Hex(fullBuffer); // runs concurrently with sends

        // Prime threshold before loop so bufferedamountlow fires on every file
        primeDataChannel(connection);

        for (let chunkIdx = 0; chunkIdx < totalChunks; chunkIdx++) {
            signal?.throwIfAborted();
            await waitForDrain(connection);

            const start = chunkIdx * CHUNK_SIZE;
            const end = Math.min(start + CHUNK_SIZE, file.size);

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

/** @deprecated Use acceptAndReceive() — calling this then receiveBatch() separately has a race condition. */
export function acceptBatchTransfer(pending: PendingBatchTransfer): void {
    pending.connection.send({ type: 'accept', transferId: pending.transferId } satisfies P2PMessage);
}

export function rejectBatchTransfer(pending: PendingBatchTransfer): void {
    pending.connection.send({ type: 'reject', transferId: pending.transferId } satisfies P2PMessage);
}

/**
 * Accept and begin receiving atomically.
 * Wires the data handler FIRST, then sends 'accept' — so no chunks arrive
 * before the receiver is listening.
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
            idleTimer = setTimeout(() => {
                settle(() => reject(new Error(
                    `Receive timed out - no data for ${RECEIVE_IDLE_TIMEOUT_MS / 1000} s`
                )));
            }, RECEIVE_IDLE_TIMEOUT_MS);
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
            try {
                connection.send({
                    type: 'cancel',
                    transferId,
                    error: 'Cancelled by receiver',
                } satisfies P2PMessage);
            } catch { /* best-effort */ }
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
                        const totalFileChunks = msg.totalChunks ?? (Math.ceil(fileMeta.size / CHUNK_SIZE) || 1);

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
                        });
                        break;
                    }

                    case 'file-complete': {
                        const fIdx = msg.fileIndex!;
                        const fileMeta = metadata.files[fIdx];
                        const chunks = fileChunks[fIdx];
                        const expectedChunks = Math.ceil(fileMeta.size / CHUNK_SIZE) || 1;

                        for (let i = 0; i < expectedChunks; i++) {
                            if (!chunks[i]) chunks[i] = new ArrayBuffer(0);
                        }

                        const combined = concatBuffers(chunks as ArrayBuffer[]);
                        let integrityOk = true;

                        if (msg.sha256) {
                            const actualHash = await sha256Hex(combined);
                            integrityOk = actualHash === msg.sha256;
                            if (!integrityOk) {
                                log.warn(`Integrity check failed for "${fileMeta.name}"`);
                            }
                        }

                        results.push({
                            blob: new Blob([combined], { type: fileMeta.type }),
                            metadata: fileMeta,
                            integrityOk,
                        });

                        fileChunks[fIdx] = [];
                        completedFiles++;
                        break;
                    }

                    case 'batch-complete':
                        settle(() => resolve(results));
                        break;

                    case 'cancel':
                        settle(() => reject(new Error(
                            `Transfer cancelled by sender: ${msg.error ?? 'unknown reason'}`
                        )));
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

export function downloadAllFiles(results: ReceivedFile[]): void {
    for (const result of results) {
        if (!result.integrityOk) {
            log.warn(`Skipping "${result.metadata.name}" - integrity check failed`);
            continue;
        }
        downloadSingleFile(result.blob, result.metadata.name);
    }
}