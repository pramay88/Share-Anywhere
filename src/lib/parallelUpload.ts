/**
 * Upload multiple files in parallel for maximum speed
 */
export async function uploadFilesInParallel<T>(
    files: File[],
    uploadFunction: (file: File, index: number) => Promise<T>,
    onProgress?: (completedCount: number, totalCount: number) => void,
    maxConcurrent: number = 3
): Promise<T[]> {
    const results: T[] = [];
    let completed = 0;
    let currentIndex = 0;

    const uploadNext = async (): Promise<void> => {
        if (currentIndex >= files.length) return;

        const index = currentIndex++;
        const file = files[index];

        try {
            const result = await uploadFunction(file, index);
            results[index] = result;
            completed++;

            if (onProgress) {
                onProgress(completed, files.length);
            }
        } catch (error) {
            throw new Error(`Failed to upload ${file.name}: ${error}`);
        }

        // Upload next file
        await uploadNext();
    };

    // Start concurrent uploads
    const workers = Array(Math.min(maxConcurrent, files.length))
        .fill(null)
        .map(() => uploadNext());

    await Promise.all(workers);
    return results;
}

/**
 * Split large file into chunks for faster upload
 */
export function splitFileIntoChunks(
    file: File,
    chunkSize: number = 5 * 1024 * 1024 // 5MB chunks
): Blob[] {
    const chunks: Blob[] = [];
    let offset = 0;

    while (offset < file.size) {
        const chunk = file.slice(offset, offset + chunkSize);
        chunks.push(chunk);
        offset += chunkSize;
    }

    return chunks;
}

/**
 * Upload file chunks in parallel
 */
export async function uploadChunkedFile(
    file: File,
    uploadChunkFunction: (chunk: Blob, index: number, total: number) => Promise<string>,
    onProgress?: (uploadedBytes: number, totalBytes: number) => void,
    chunkSize: number = 5 * 1024 * 1024
): Promise<string[]> {
    const chunks = splitFileIntoChunks(file, chunkSize);
    let uploadedBytes = 0;

    const uploadChunk = async (chunk: Blob, index: number): Promise<string> => {
        const chunkId = await uploadChunkFunction(chunk, index, chunks.length);

        uploadedBytes += chunk.size;
        if (onProgress) {
            onProgress(uploadedBytes, file.size);
        }

        return chunkId;
    };

    // Upload chunks in parallel (3 at a time for optimal speed)
    return await uploadFilesInParallel(
        chunks.map((chunk, i) => new File([chunk], `${file.name}.part${i}`)),
        (chunkFile, index) => uploadChunk(chunks[index], index),
        undefined,
        3
    );
}

/**
 * Batch process items with rate limiting
 */
export async function batchProcess<T, R>(
    items: T[],
    processFunction: (item: T, index: number) => Promise<R>,
    batchSize: number = 5,
    delayBetweenBatches: number = 100
): Promise<R[]> {
    const results: R[] = [];

    for (let i = 0; i < items.length; i += batchSize) {
        const batch = items.slice(i, i + batchSize);
        const batchResults = await Promise.all(
            batch.map((item, index) => processFunction(item, i + index))
        );
        results.push(...batchResults);

        // Delay between batches to avoid rate limiting
        if (i + batchSize < items.length) {
            await new Promise((resolve) => setTimeout(resolve, delayBetweenBatches));
        }
    }

    return results;
}

/**
 * Retry failed operations with exponential backoff
 */
export async function retryOperation<T>(
    operation: () => Promise<T>,
    maxRetries: number = 3,
    baseDelay: number = 1000
): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            return await operation();
        } catch (error) {
            lastError = error as Error;

            if (attempt < maxRetries) {
                const delay = baseDelay * Math.pow(2, attempt);
                await new Promise((resolve) => setTimeout(resolve, delay));
            }
        }
    }

    throw lastError || new Error('Operation failed after retries');
}

/**
 * Calculate optimal chunk size based on file size
 */
export function calculateOptimalChunkSize(fileSize: number): number {
    if (fileSize < 10 * 1024 * 1024) {
        // Files < 10MB: no chunking needed
        return fileSize;
    } else if (fileSize < 100 * 1024 * 1024) {
        // Files 10-100MB: 5MB chunks
        return 5 * 1024 * 1024;
    } else {
        // Files > 100MB: 10MB chunks
        return 10 * 1024 * 1024;
    }
}

/**
 * Monitor upload speed
 */
export class UploadSpeedMonitor {
    private startTime: number = 0;
    private uploadedBytes: number = 0;
    private lastUpdate: number = 0;
    private speeds: number[] = [];

    start() {
        this.startTime = Date.now();
        this.lastUpdate = this.startTime;
        this.uploadedBytes = 0;
        this.speeds = [];
    }

    update(bytes: number) {
        const now = Date.now();
        const timeDiff = (now - this.lastUpdate) / 1000; // seconds

        if (timeDiff > 0) {
            const speed = bytes / timeDiff; // bytes per second
            this.speeds.push(speed);

            // Keep only last 10 measurements for average
            if (this.speeds.length > 10) {
                this.speeds.shift();
            }
        }

        this.uploadedBytes += bytes;
        this.lastUpdate = now;
    }

    getAverageSpeed(): number {
        if (this.speeds.length === 0) return 0;
        return this.speeds.reduce((a, b) => a + b, 0) / this.speeds.length;
    }

    getCurrentSpeed(): number {
        return this.speeds[this.speeds.length - 1] || 0;
    }

    getFormattedSpeed(): string {
        const speed = this.getAverageSpeed();

        if (speed < 1024) {
            return `${speed.toFixed(0)} B/s`;
        } else if (speed < 1024 * 1024) {
            return `${(speed / 1024).toFixed(1)} KB/s`;
        } else {
            return `${(speed / (1024 * 1024)).toFixed(1)} MB/s`;
        }
    }

    getEstimatedTimeRemaining(totalBytes: number): string {
        const speed = this.getAverageSpeed();
        if (speed === 0) return 'Calculating...';

        const remainingBytes = totalBytes - this.uploadedBytes;
        const secondsRemaining = remainingBytes / speed;

        if (secondsRemaining < 60) {
            return `${Math.ceil(secondsRemaining)}s`;
        } else if (secondsRemaining < 3600) {
            return `${Math.ceil(secondsRemaining / 60)}m`;
        } else {
            return `${Math.ceil(secondsRemaining / 3600)}h`;
        }
    }
}
