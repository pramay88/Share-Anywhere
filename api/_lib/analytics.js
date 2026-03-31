import { admin } from './firebase-admin.js';

export const DATA_VERSION = 2;
const TERMINAL_STATUSES = new Set(['success', 'failed', 'cancelled']);
const ACTIVE_STATUSES = new Set(['active', 'pending']);

export function toDate(value) {
    if (!value) return null;
    if (value instanceof Date) return value;
    if (typeof value.toDate === 'function') return value.toDate();
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function normalizeNumber(value, fallback = 0) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    return fallback;
}

function normalizeStatus(status) {
    const normalized = String(status || '').toLowerCase();
    if (TERMINAL_STATUSES.has(normalized) || ACTIVE_STATUSES.has(normalized)) {
        return normalized;
    }
    return 'success';
}

function normalizeTransferType(type) {
    return String(type || '').toLowerCase() === 'p2p' ? 'p2p' : 'internet';
}

function safeISOString(value, fallback = null) {
    if (!value) return fallback;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return fallback;
    return parsed.toISOString();
}

function activeDocId(event) {
    const key = event.transferId || event.shareCode || event.eventKey;
    return `${event.transferType}_${String(key).replace(/[^A-Za-z0-9_-]/g, '_')}`;
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

    // Set 24-hour expiration for all active/pending transfers
    const isActiveStatus = ACTIVE_STATUSES.has(status);
    const expiresAt = isActiveStatus ? new Date(createdAt.getTime() + 24 * 60 * 60 * 1000) : null;

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
        expiresAt,
    };
}

function analyticsDocFields(delta) {
    return {
        version: DATA_VERSION,
        total_transfers: admin.firestore.FieldValue.increment(delta.total_transfers),
        total_bytes: admin.firestore.FieldValue.increment(delta.total_bytes),
        total_duration: admin.firestore.FieldValue.increment(delta.total_duration),
        total_failures: admin.firestore.FieldValue.increment(delta.total_failures),
        total_retries: admin.firestore.FieldValue.increment(delta.total_retries),
        total_downloads: admin.firestore.FieldValue.increment(delta.total_downloads),
        updatedAt: new Date(),
    };
}

function buildAggregateDelta(event) {
    const delta = {
        total_transfers: 0,
        total_bytes: 0,
        total_duration: 0,
        total_failures: 0,
        total_retries: 0,
        total_downloads: 0,
    };

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

export function normalizeHistoryRecord(raw, id) {
    return {
        id,
        transferId: raw.transferId || null,
        shareCode: raw.shareCode || null,
        transferType: raw.transferType || 'internet',
        direction: raw.direction || 'send',
        status: raw.status || 'success',
        fileName: raw.file?.name || null,
        fileType: raw.file?.type || null,
        fileSize: raw.file?.size || 0,
        totalBytes: raw.totalBytes || 0,
        downloadsCount: raw.downloadsCount || 0,
        durationMs: raw.durationMs || 0,
        speedBytesPerSec: raw.speedBytesPerSec || 0,
        error: raw.error || null,
        timestamp: toDate(raw.timestamp || raw.createdAt)?.toISOString() || new Date().toISOString(),
    };
}

export async function processAnalyticsEvent(db, payload, userId = null) {
    const event = sanitizeEvent({ ...payload, userId });
    const batch = db.batch();

    const activeRef = db.collection('active_shares').doc(activeDocId(event));

    if (ACTIVE_STATUSES.has(event.status)) {
        batch.set(activeRef, buildActiveDoc(event), { merge: true });
    }

    if (event.transferType === 'internet' && event.direction === 'receive' && event.status === 'success') {
        batch.set(activeRef, {
            downloads_count: admin.firestore.FieldValue.increment(1),
            updatedAt: new Date(),
            version: DATA_VERSION,
        }, { merge: true });
    }

    if (TERMINAL_STATUSES.has(event.status)) {
        const shouldDeleteActive = event.direction === 'send' || event.status === 'cancelled';
        if (shouldDeleteActive) {
            batch.delete(activeRef);
        }

        if (!event.isEphemeral) {
            const historyRef = db.collection('history').doc();
            batch.set(historyRef, buildHistoryDoc(event));
        }
    }

    const delta = buildAggregateDelta(event);
    batch.set(db.collection('analytics').doc('global'), analyticsDocFields(delta), { merge: true });

    if (!event.isEphemeral && event.userId) {
        batch.set(db.collection('analytics_users').doc(event.userId), analyticsDocFields(delta), { merge: true });
    }

    await batch.commit();
    return { version: DATA_VERSION, accepted: true };
}
