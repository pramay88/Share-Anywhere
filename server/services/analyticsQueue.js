/**
 * Async analytics queue (data model v2).
 *
 * Data separation:
 * - active_shares: ongoing transfers only
 * - history: terminal transfers only (success/failed/cancelled)
 * - analytics: aggregated metrics only (global + user)
 */

import { FieldValue } from 'firebase-admin/firestore';
import { getFirestore } from '../config/firebase.js';

const DATA_VERSION = 2;
const FLUSH_INTERVAL_MS = 2000;
const CLEANUP_INTERVAL_MS = 15 * 60 * 1000;
const MAX_BATCH_SIZE = 100;
const MAX_QUEUE_SIZE = 10000;
const GUEST_TTL_MS = 24 * 60 * 60 * 1000;

const TERMINAL_STATUSES = new Set(['success', 'failed', 'cancelled']);
const ACTIVE_STATUSES = new Set(['active', 'pending']);

const queue = [];
let flushInProgress = false;
let flusherStarted = false;

function normalizeNumber(value, fallback = 0) {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
    }
    return fallback;
}

function normalizeStatus(status) {
    const normalized = String(status || '').toLowerCase();
    if ([...TERMINAL_STATUSES, ...ACTIVE_STATUSES].includes(normalized)) {
        return normalized;
    }
    return 'success';
}

function normalizeTransferType(type) {
    const normalized = String(type || '').toLowerCase();
    return normalized === 'p2p' ? 'p2p' : 'internet';
}

function safeISOString(value, fallback = null) {
    if (!value) return fallback;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return fallback;
    return parsed.toISOString();
}

function sanitizeEvent(event = {}) {
    const status = normalizeStatus(event.status);
    const transferType = normalizeTransferType(event.transferType);
    const userId = event.userId || null;
    const isGuest = !userId;
    const isEphemeral = event.is_ephemeral === true || event.isEphemeral === true;
    const createdAt = new Date();

    const transferId = event.transferId || event.transfer_id || null;
    const shareCode = event.shareCode || event.share_code || null;
    const keySeed = transferId || shareCode || `event_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    return {
        version: DATA_VERSION,
        userId,
        isGuest,
        isEphemeral,
        eventKey: `${transferType}:${keySeed}:${event.direction || 'send'}`,
        transferId,
        shareCode,
        transferType,
        direction: event.direction || 'send',
        status,
        fileName: event.fileName || null,
        fileType: event.fileType || null,
        fileSize: normalizeNumber(event.fileSize, 0),
        totalBytes: normalizeNumber(event.totalBytes, 0),
        durationMs: normalizeNumber(event.durationMs, 0),
        retries: normalizeNumber(event.retries, 0),
        speedBytesPerSec: normalizeNumber(event.speedBytesPerSec, 0),
        downloadsIncrement: normalizeNumber(event.downloadsIncrement, 0),
        error: event.error || null,
        metadata: event.metadata && typeof event.metadata === 'object' ? event.metadata : {},
        timestamp: safeISOString(event.clientTimestamp, createdAt.toISOString()),
        createdAt,
        expiresAt: isGuest ? new Date(createdAt.getTime() + GUEST_TTL_MS) : null,
    };
}

function buildAggregateDelta(events) {
    const delta = {
        total_transfers: 0,
        total_bytes: 0,
        total_duration: 0,
        total_failures: 0,
        total_retries: 0,
        total_downloads: 0,
    };

    for (const event of events) {
        if (TERMINAL_STATUSES.has(event.status)) {
            delta.total_transfers += 1;
        }

        if (event.status === 'success') {
            delta.total_bytes += normalizeNumber(event.totalBytes, 0);
            delta.total_duration += normalizeNumber(event.durationMs, 0);
        }

        if (event.status === 'failed' || event.status === 'cancelled') {
            delta.total_failures += 1;
        }

        delta.total_retries += normalizeNumber(event.retries, 0);

        if (event.transferType === 'internet' && event.direction === 'receive' && event.status === 'success') {
            delta.total_downloads += 1;
        }
        delta.total_downloads += normalizeNumber(event.downloadsIncrement, 0);
    }

    return delta;
}

function buildActiveDoc(event) {
    return {
        version: DATA_VERSION,
        transferId: event.transferId,
        shareCode: event.shareCode,
        userId: event.userId,
        transferType: event.transferType,
        direction: event.direction,
        status: event.status,
        file: {
            name: event.fileName,
            size: event.fileSize,
            type: event.fileType,
        },
        totalBytes: event.totalBytes,
        startedAt: event.timestamp,
        updatedAt: new Date(),
        downloads_count: 0,
        is_ephemeral: event.isEphemeral,
        expiresAt: event.expiresAt,
    };
}

function buildHistoryDoc(event) {
    const downloadsCount = normalizeNumber(
        event.metadata?.downloads_count,
        normalizeNumber(event.downloadsIncrement, 0)
    );

    return {
        version: DATA_VERSION,
        transferId: event.transferId,
        shareCode: event.shareCode,
        userId: event.userId,
        isGuest: event.isGuest,
        transferType: event.transferType,
        direction: event.direction,
        status: event.status,
        file: {
            name: event.fileName,
            size: event.fileSize,
            type: event.fileType,
        },
        totalBytes: event.totalBytes,
        durationMs: event.durationMs,
        speedBytesPerSec: event.durationMs > 0 && event.totalBytes > 0
            ? Math.round(event.totalBytes / (event.durationMs / 1000))
            : 0,
        downloadsCount,
        retries: event.retries,
        error: event.error,
        timestamp: event.timestamp,
        createdAt: new Date(),
        expiresAt: event.expiresAt,
    };
}

function analyticsDocFields(delta) {
    return {
        version: DATA_VERSION,
        total_transfers: FieldValue.increment(delta.total_transfers),
        total_bytes: FieldValue.increment(delta.total_bytes),
        total_duration: FieldValue.increment(delta.total_duration),
        total_failures: FieldValue.increment(delta.total_failures),
        total_retries: FieldValue.increment(delta.total_retries),
        total_downloads: FieldValue.increment(delta.total_downloads),
        updatedAt: new Date(),
    };
}

function activeDocId(event) {
    const key = event.transferId || event.shareCode || event.eventKey;
    return `${event.transferType}_${String(key).replace(/[^A-Za-z0-9_-]/g, '_')}`;
}

async function cleanupExpiredGuestDocs() {
    const db = getFirestore();
    const now = new Date();

    const [activeSnapshot, historySnapshot, legacySnapshot] = await Promise.all([
        db.collection('active_shares').where('expiresAt', '<', now).limit(200).get(),
        db.collection('history').where('expiresAt', '<', now).limit(200).get(),
        db.collection('transferHistory').where('createdAt', '<', new Date(now.getTime() - GUEST_TTL_MS)).limit(200).get(),
    ]);

    const batch = db.batch();

    activeSnapshot.docs.forEach((doc) => batch.delete(doc.ref));
    historySnapshot.docs.forEach((doc) => batch.delete(doc.ref));

    // Safe clear for old v1 logs.
    legacySnapshot.docs.forEach((doc) => {
        const data = doc.data();
        if (data.version !== DATA_VERSION) {
            batch.delete(doc.ref);
        }
    });

    if (
        activeSnapshot.size === 0 &&
        historySnapshot.size === 0 &&
        legacySnapshot.size === 0
    ) {
        return;
    }

    await batch.commit();
}

async function flushQueue() {
    if (flushInProgress || queue.length === 0) {
        return;
    }

    flushInProgress = true;
    const batchEvents = queue.splice(0, MAX_BATCH_SIZE).map((event) => sanitizeEvent(event));

    try {
        const db = getFirestore();
        const writeBatch = db.batch();

        const globalDeltaEvents = [];
        const userBuckets = new Map();

        for (const event of batchEvents) {
            const activeRef = db.collection('active_shares').doc(activeDocId(event));

            if (ACTIVE_STATUSES.has(event.status)) {
                writeBatch.set(activeRef, buildActiveDoc(event), { merge: true });
            }

            if (event.transferType === 'internet' && event.direction === 'receive' && event.status === 'success') {
                writeBatch.set(activeRef, {
                    downloads_count: FieldValue.increment(1),
                    updatedAt: new Date(),
                    version: DATA_VERSION,
                }, { merge: true });
            }

            if (TERMINAL_STATUSES.has(event.status)) {
                // Keep active internet share rows alive for receiver success events.
                // A sender share should only be removed by sender terminal/cancel events.
                const shouldDeleteActive = event.direction === 'send' || event.status === 'cancelled';
                if (shouldDeleteActive) {
                    writeBatch.delete(activeRef);
                }

                if (!event.isEphemeral) {
                    // Use transferId or shareCode as document ID to enable upsert semantics
                    // This prevents duplicate history entries when a transfer is first completed
                    // then later cancelled/terminated
                    // For P2P, include direction to avoid sender/receiver collision since both use same shareCode
                    let historyDocId = event.transferId || event.shareCode || null;
                    if (historyDocId && event.transferType === 'p2p') {
                        historyDocId = `${historyDocId}_${event.direction}`;
                    }
                    const historyRef = historyDocId
                        ? db.collection('history').doc(historyDocId)
                        : db.collection('history').doc();
                    writeBatch.set(historyRef, buildHistoryDoc(event), { merge: false });
                }
            }

            globalDeltaEvents.push(event);

            if (!event.isEphemeral && event.userId) {
                if (!userBuckets.has(event.userId)) {
                    userBuckets.set(event.userId, []);
                }
                userBuckets.get(event.userId).push(event);
            }
        }

        const globalRef = db.collection('analytics').doc('global');
        writeBatch.set(globalRef, analyticsDocFields(buildAggregateDelta(globalDeltaEvents)), { merge: true });

        for (const [userId, events] of userBuckets.entries()) {
            const userRef = db.collection('analytics_users').doc(userId);
            writeBatch.set(userRef, analyticsDocFields(buildAggregateDelta(events)), { merge: true });
        }

        await writeBatch.commit();
    } catch (error) {
        console.error('Analytics queue flush failed:', error);
        queue.unshift(...batchEvents);
        if (queue.length > MAX_QUEUE_SIZE) {
            queue.splice(0, queue.length - MAX_QUEUE_SIZE);
        }
    } finally {
        flushInProgress = false;
    }
}

export function startAnalyticsQueueFlusher() {
    if (flusherStarted) {
        return;
    }

    flusherStarted = true;

    setInterval(() => {
        flushQueue().catch((error) => {
            console.error('Analytics flusher error:', error);
        });
    }, FLUSH_INTERVAL_MS);

    setInterval(() => {
        cleanupExpiredGuestDocs().catch((error) => {
            console.error('Guest cleanup error:', error);
        });
    }, CLEANUP_INTERVAL_MS);
}

export function enqueueAnalyticsEvent(event) {
    if (!event || typeof event !== 'object') {
        return false;
    }

    if (queue.length >= MAX_QUEUE_SIZE) {
        queue.shift();
    }

    queue.push(event);
    return true;
}

export function getAnalyticsQueueStats() {
    return {
        queued: queue.length,
        flushInProgress,
        version: DATA_VERSION,
    };
}
