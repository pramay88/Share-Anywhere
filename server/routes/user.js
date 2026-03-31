/**
 * User routes (data model v2)
 */

import express from 'express';
import { getFirestore } from '../config/firebase.js';
import { validateApiKey, publicRateLimiter } from '../middleware/auth.js';
import { enqueueAnalyticsEvent, getAnalyticsQueueStats } from '../services/analyticsQueue.js';

const router = express.Router();
const DATA_VERSION = 2;

function toDate(value) {
    if (!value) return null;
    if (value instanceof Date) return value;
    if (typeof value.toDate === 'function') return value.toDate();
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function normalizeHistoryRecord(raw, id) {
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
        retries: raw.retries || 0,
        error: raw.error || null,
        timestamp: toDate(raw.timestamp || raw.createdAt)?.toISOString() || new Date().toISOString(),
    };
}

/**
 * POST /api/user/analytics/event
 * Ingest guest/anonymous events without a user id.
 */
router.post('/analytics/event', publicRateLimiter, async (req, res) => {
    try {
        const accepted = enqueueAnalyticsEvent({
            ...req.body,
            userId: null,
            clientTimestamp: req.body?.clientTimestamp || new Date().toISOString(),
        });

        res.status(202).json({
            success: accepted,
            queued: accepted,
            version: DATA_VERSION,
        });
    } catch (error) {
        console.error('Error queuing anonymous analytics event:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to queue analytics event',
            message: error.message,
        });
    }
});

/**
 * GET /api/user/admin/analytics/summary
 * Aggregated global metrics only.
 */
router.get('/admin/analytics/summary', publicRateLimiter, async (req, res) => {
    try {
        const db = getFirestore();
        const globalDoc = await db.collection('analytics').doc('global').get();
        const data = globalDoc.exists ? globalDoc.data() : {};

        const totalTransfers = data?.total_transfers || 0;
        const totalBytes = data?.total_bytes || 0;
        const totalDuration = data?.total_duration || 0;
        const avgSpeed = totalTransfers >= 1 && totalDuration > 0
            ? totalBytes / (totalDuration / 1000)
            : 0;

        res.json({
            success: true,
            version: DATA_VERSION,
            analytics: {
                total_transfers: totalTransfers,
                total_bytes: totalBytes,
                total_duration: totalDuration,
                total_failures: data?.total_failures || 0,
                total_retries: data?.total_retries || 0,
                total_downloads: data?.total_downloads || 0,
                avg_speed_bytes_per_sec: avgSpeed,
                updatedAt: toDate(data?.updatedAt)?.toISOString() || null,
            },
            queue: getAnalyticsQueueStats(),
        });
    } catch (error) {
        console.error('Error fetching admin analytics summary:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch admin analytics summary',
            message: error.message,
        });
    }
});

/**
 * POST /api/user/:userId/analytics/event
 * Ingest user analytics/history events asynchronously.
 */
router.post('/:userId/analytics/event', publicRateLimiter, async (req, res) => {
    try {
        const { userId } = req.params;

        if (!userId) {
            return res.status(400).json({
                success: false,
                error: 'User ID is required',
            });
        }

        const accepted = enqueueAnalyticsEvent({
            ...req.body,
            userId,
            clientTimestamp: req.body?.clientTimestamp || new Date().toISOString(),
        });

        res.status(202).json({
            success: accepted,
            queued: accepted,
            version: DATA_VERSION,
        });
    } catch (error) {
        console.error('Error queuing analytics event:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to queue analytics event',
            message: error.message,
        });
    }
});

/**
 * GET /api/user/:userId/active-shares
 * Ongoing transfers only.
 */
router.get('/:userId/active-shares', publicRateLimiter, async (req, res) => {
    try {
        const { userId } = req.params;

        if (!userId) {
            return res.status(400).json({
                success: false,
                error: 'User ID is required',
            });
        }

        const db = getFirestore();
        const snapshot = await db
            .collection('active_shares')
            .where('version', '==', DATA_VERSION)
            .where('userId', '==', userId)
            .limit(500)
            .get();

        const transfersSnapshot = await db
            .collection('transfers')
            .where('owner_id', '==', userId)
            .limit(500)
            .get();

        const queueActiveShares = snapshot.docs
            .map((doc) => ({ id: doc.id, ...doc.data() }))
            .filter((row) => ['active', 'pending'].includes(String(row.status || '').toLowerCase()))
            .sort((a, b) => {
                const at = toDate(a.updatedAt || a.startedAt)?.getTime() || 0;
                const bt = toDate(b.updatedAt || b.startedAt)?.getTime() || 0;
                return bt - at;
            })
            .map((row) => ({
                id: row.id,
                transferId: row.transferId || null,
                shareCode: row.shareCode || null,
                transferType: row.transferType || 'internet',
                direction: row.direction || 'send',
                status: row.status || 'active',
                fileName: row.file?.name || null,
                fileType: row.file?.type || null,
                fileSize: row.file?.size || 0,
                totalBytes: row.totalBytes || 0,
                downloads_count: row.downloads_count || 0,
                is_ephemeral: row.is_ephemeral === true,
                timestamp: toDate(row.startedAt)?.toISOString() || new Date().toISOString(),
            }));

        const transferActiveShares = transfersSnapshot.docs
            .map((doc) => ({ id: doc.id, ...doc.data() }))
            .filter((row) => {
                const expiresAt = toDate(row.expires_at || row.expiresAt);
                return !expiresAt || expiresAt.getTime() > Date.now();
            })
            .map((row) => ({
                id: `transfer_${row.id}`,
                transferId: row.id,
                shareCode: row.share_code || row.shareCode || null,
                transferType: 'internet',
                direction: 'send',
                status: 'active',
                fileName: row.content_type === 'text' ? 'Text content' : null,
                fileType: row.content_type === 'text' ? 'text/plain' : null,
                fileSize: 0,
                totalBytes: 0,
                downloads_count: 0,
                is_ephemeral: row.is_ephemeral === true,
                timestamp: toDate(row.created_at || row.createdAt)?.toISOString() || new Date().toISOString(),
            }));

        const seenShareCodes = new Set(queueActiveShares.map((item) => item.shareCode).filter(Boolean));
        const fallbackShares = transferActiveShares.filter((item) => !item.shareCode || !seenShareCodes.has(item.shareCode));
        const activeShares = [...queueActiveShares, ...fallbackShares].sort((a, b) => {
            const at = toDate(a.timestamp)?.getTime() || 0;
            const bt = toDate(b.timestamp)?.getTime() || 0;
            return bt - at;
        });

        res.json({
            success: true,
            version: DATA_VERSION,
            activeShares,
            count: activeShares.length,
        });
    } catch (error) {
        console.error('Error fetching active shares:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch active shares',
            message: error.message,
        });
    }
});

/**
 * DELETE /api/user/:userId/active-shares/:shareCode
 * Stop an active share.
 */
router.delete('/:userId/active-shares/:shareCode', publicRateLimiter, async (req, res) => {
    try {
        const { userId, shareCode } = req.params;

        if (!userId || !shareCode) {
            return res.status(400).json({
                success: false,
                error: 'User ID and share code are required',
            });
        }

        enqueueAnalyticsEvent({
            userId,
            shareCode: shareCode.toUpperCase(),
            transferType: 'internet',
            direction: 'send',
            status: 'cancelled',
            retries: 0,
            durationMs: 0,
            totalBytes: 0,
            metadata: { source: 'active-share-delete' },
            clientTimestamp: new Date().toISOString(),
        });

        const db = getFirestore();
        const snapshot = await db
            .collection('active_shares')
            .where('version', '==', DATA_VERSION)
            .where('userId', '==', userId)
            .where('shareCode', '==', shareCode.toUpperCase())
            .limit(20)
            .get();

        const batch = db.batch();
        snapshot.docs.forEach((doc) => batch.delete(doc.ref));
        if (!snapshot.empty) {
            await batch.commit();
        }

        res.json({
            success: true,
            version: DATA_VERSION,
            message: 'Share stopped successfully',
        });
    } catch (error) {
        console.error('Error stopping active share:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to stop active share',
            message: error.message,
        });
    }
});

/**
 * GET /api/user/:userId/history
 * Completed/failed/cancelled transfers only.
 */
router.get('/:userId/history', publicRateLimiter, async (req, res) => {
    try {
        const { userId } = req.params;

        if (!userId) {
            return res.status(400).json({
                success: false,
                error: 'User ID is required',
            });
        }

        const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
        const cursor = req.query.cursor ? parseInt(req.query.cursor, 10) : null;
        const typeFilter = req.query.type ? String(req.query.type).toLowerCase() : null;
        const statusFilter = req.query.status ? String(req.query.status).toLowerCase() : null;

        const db = getFirestore();
        const snapshot = await db
            .collection('history')
            .where('version', '==', DATA_VERSION)
            .where('userId', '==', userId)
            .limit(2000)
            .get();

        let records = snapshot.docs
            .map((doc) => normalizeHistoryRecord(doc.data(), doc.id))
            .filter((record) => ['success', 'failed', 'cancelled'].includes(record.status))
            .filter((record) => {
                const ts = new Date(record.timestamp).getTime();
                if (cursor && Number.isFinite(cursor) && ts >= cursor) return false;
                if (typeFilter && record.transferType !== typeFilter) return false;
                if (statusFilter && record.status !== statusFilter) return false;
                return true;
            })
            .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

        const paginated = records.slice(0, limit);
        const last = paginated[paginated.length - 1] || null;

        res.json({
            success: true,
            version: DATA_VERSION,
            records: paginated,
            pagination: {
                limit,
                hasMore: records.length > limit,
                nextCursor: last ? new Date(last.timestamp).getTime() : null,
            },
            count: paginated.length,
        });
    } catch (error) {
        console.error('Error fetching user history:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch history',
            message: error.message,
        });
    }
});

/**
 * GET /api/user/:userId/stats
 * User-level analytics summary (aggregated only).
 */
router.get('/:userId/stats', publicRateLimiter, async (req, res) => {
    try {
        const { userId } = req.params;

        if (!userId) {
            return res.status(400).json({
                success: false,
                error: 'User ID is required',
            });
        }

        const db = getFirestore();

        const [analyticsDoc, activeSnapshot, transfersSnapshot] = await Promise.all([
            db.collection('analytics_users').doc(userId).get(),
            db.collection('active_shares')
                .where('version', '==', DATA_VERSION)
                .where('userId', '==', userId)
                .limit(500)
                .get(),
            db.collection('transfers')
                .where('owner_id', '==', userId)
                .limit(1000)
                .get(),
        ]);

        const analytics = analyticsDoc.exists ? analyticsDoc.data() : {};

        const totalTransfers = analytics?.total_transfers || 0;
        const totalBytes = analytics?.total_bytes || 0;
        const totalDuration = analytics?.total_duration || 0;
        const avgSpeed = totalTransfers >= 1 && totalDuration > 0
            ? totalBytes / (totalDuration / 1000)
            : 0;

        const activeSharesFromQueue = activeSnapshot.docs.filter((doc) => {
            const status = String(doc.data()?.status || '').toLowerCase();
            return status === 'active' || status === 'pending';
        }).length;

        const activeSharesFromTransfers = transfersSnapshot.docs.filter((doc) => {
            const data = doc.data();
            const expiresAt = toDate(data?.expires_at || data?.expiresAt);
            return !expiresAt || expiresAt.getTime() > Date.now();
        }).length;

        const activeShares = Math.max(activeSharesFromQueue, activeSharesFromTransfers);

        res.json({
            success: true,
            version: DATA_VERSION,
            stats: {
                totalSends: totalTransfers,
                totalReceives: analytics?.total_downloads || 0,
                totalDataShared: totalBytes,
                activeShares,
                totalFailures: analytics?.total_failures || 0,
                totalRetries: analytics?.total_retries || 0,
                averageSpeedBytesPerSec: avgSpeed,
                total_bytes: totalBytes,
                total_duration: totalDuration,
                total_transfers: totalTransfers,
                lastUpdated: toDate(analytics?.updatedAt)?.toISOString() || new Date().toISOString(),
            },
        });
    } catch (error) {
        console.error('Error fetching user stats:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch stats',
            message: error.message,
        });
    }
});

/**
 * POST /api/user/:userId/stats/increment
 * Kept for compatibility.
 */
router.post('/:userId/stats/increment', validateApiKey, async (req, res) => {
    res.json({
        success: true,
        version: DATA_VERSION,
        message: 'Stats increment endpoint is deprecated in v2. Use analytics events.',
    });
});

export default router;
