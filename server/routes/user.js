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
        const [snapshot, transfersSnapshot, sharesSnapshotByOwnerId, sharesSnapshotByOwnerSnake] = await Promise.all([
            db
                .collection('active_shares')
                .where('version', '==', DATA_VERSION)
                .where('userId', '==', userId)
                .limit(500)
                .get(),
            db
                .collection('transfers')
                .where('owner_id', '==', userId)
                .limit(500)
                .get(),
            db
                .collection('shares')
                .where('ownerId', '==', userId)
                .limit(500)
                .get(),
            db
                .collection('shares')
                .where('owner_id', '==', userId)
                .limit(500)
                .get(),
        ]);

        const queueActiveShares = snapshot.docs
            .map((doc) => ({ id: doc.id, ...doc.data() }))
            .filter((row) => {
                const isActiveStatus = ['active', 'pending'].includes(String(row.status || '').toLowerCase());
                if (!isActiveStatus) return false;

                // P2P is one-time and should never be listed as active.
                if (String(row.transferType || '').toLowerCase() === 'p2p') {
                    return false;
                }

                return true;
            })
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

        const transferRows = transfersSnapshot.docs
            .map((doc) => ({ id: doc.id, ...doc.data() }))
            .filter((row) => {
                const expiresAt = toDate(row.expires_at || row.expiresAt);
                return !expiresAt || expiresAt.getTime() > Date.now();
            })
            ;

        const transferActiveShares = await Promise.all(transferRows.map(async (row) => {
            let fileName = null;
            let fileType = null;
            let fileSize = 0;

            if (row.content_type === 'text') {
                const textContent = String(row.text_content || row.textContent || '');
                fileName = 'Text content';
                fileType = 'text/plain';
                fileSize = textContent ? Buffer.byteLength(textContent, 'utf8') : Number(row.total_bytes || row.totalBytes || 0);
            } else {
                try {
                    const filesSnapshot = await db.collection('transfers').doc(row.id).collection('files').limit(1).get();
                    if (!filesSnapshot.empty) {
                        const file = filesSnapshot.docs[0].data();
                        fileName = file.original_name || file.file_name || null;
                        fileType = file.mime_type || file.file_type || null;
                        fileSize = Number(file.file_size || file.size || 0);
                    }
                } catch {
                    // Keep response resilient if subcollection read fails.
                }
            }

            const totalBytes = Number(row.total_bytes || row.totalBytes || fileSize || 0);
            return {
                id: `transfer_${row.id}`,
                transferId: row.id,
                shareCode: row.share_code || row.shareCode || row.id || null,
                transferType: 'internet',
                direction: 'send',
                status: 'active',
                fileName: row.file_name || row.fileName || fileName || row.share_code || row.id || 'Unknown',
                fileType: row.file_type || row.fileType || fileType,
                fileSize: Number(row.file_size || row.fileSize || fileSize || 0),
                totalBytes,
                downloads_count: Number(row.consume_count || row.downloads_count || row.downloadCount || 0),
                is_ephemeral: row.is_ephemeral === true,
                timestamp: toDate(row.created_at || row.createdAt)?.toISOString() || new Date().toISOString(),
            };
        }));

        const sharesDocs = [
            ...sharesSnapshotByOwnerId.docs,
            ...sharesSnapshotByOwnerSnake.docs,
        ];

        const sharesActive = sharesDocs
            .map((doc) => ({ id: doc.id, ...doc.data() }))
            .filter((row) => {
                const status = String(row.status || '').toLowerCase();
                if (!['ready', 'pending', 'active'].includes(status)) {
                    return false;
                }

                const expiresAt = toDate(row.expiresAt || row.expires_at);
                if (expiresAt && expiresAt.getTime() <= Date.now()) {
                    return false;
                }

                const createdAt = toDate(row.createdAt || row.created_at);
                const twentyFourHoursAgo = Date.now() - (24 * 60 * 60 * 1000);
                if (createdAt && createdAt.getTime() < twentyFourHoursAgo) {
                    return false;
                }

                const isEphemeral = row.is_ephemeral === true || row.isEphemeral === true;
                const downloads = Number(row.downloadCount || row.downloads_count || 0);
                if (isEphemeral && downloads > 0) {
                    return false;
                }

                return true;
            })
            .map((row) => {
                const contentType = row.contentType || row.type || 'file';
                let fileName, fileSize, fileType;

                if (contentType === 'text') {
                    fileName = 'Text content';
                    fileType = 'text/plain';
                    fileSize = row.content ? Buffer.byteLength(row.content, 'utf8') : 0;
                } else if (contentType === 'url') {
                    fileName = row.title || 'URL link';
                    fileType = null;
                    fileSize = 0;
                } else {
                    fileName = row.fileName || row.shareCode || row.code || row.id || 'Unknown';
                    fileSize = Number(row.fileSize || 0);
                    fileType = row.mimeType || 'application/octet-stream';
                }

                const shareCode = row.shareCode || row.code || row.id;
                return {
                    id: `share_${row.id}`,
                    transferId: row.transferId || row.id,
                    shareCode,
                    transferType: 'internet',
                    direction: 'send',
                    status: 'active',
                    fileName,
                    fileType,
                    fileSize,
                    totalBytes: fileSize,
                    downloads_count: Number(row.downloadCount || row.downloads_count || 0),
                    is_ephemeral: row.is_ephemeral === true || row.isEphemeral === true,
                    timestamp: toDate(row.createdAt || row.created_at)?.toISOString() || new Date().toISOString(),
                    expiresAt: toDate(row.expiresAt || row.expires_at)?.toISOString() || null,
                };
            });

        const shareByCode = new Map(sharesActive.map((item) => [item.shareCode, item]));
        const shareByTransferId = new Map(sharesActive.map((item) => [item.transferId, item]));

        const enrichFromShares = (item) => {
            const matched = shareByCode.get(item.shareCode) || shareByTransferId.get(item.transferId) || null;
            if (!matched) return item;
            return {
                ...item,
                fileName: item.fileName || matched.fileName,
                fileType: item.fileType || matched.fileType,
                fileSize: Number(item.fileSize || matched.fileSize || 0),
                totalBytes: Number(item.totalBytes || matched.totalBytes || matched.fileSize || 0),
                downloads_count: Number(item.downloads_count || matched.downloads_count || 0),
            };
        };

        const normalizedQueue = queueActiveShares.map(enrichFromShares);
        const normalizedTransfers = transferActiveShares.map(enrichFromShares);
        const allCandidates = [...sharesActive, ...normalizedQueue, ...normalizedTransfers];

        const seen = new Set();
        const activeShares = allCandidates.filter((item) => {
            const key = item.shareCode || item.transferId || item.id;
            if (!key) return true;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        }).sort((a, b) => {
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

        const [analyticsDoc, activeSnapshot, transfersSnapshot, sharesSnapshotByOwnerId, sharesSnapshotByOwnerSnake] = await Promise.all([
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
            db.collection('shares')
                .where('ownerId', '==', userId)
                .limit(1000)
                .get(),
            db.collection('shares')
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

        const activeSharesFromShares = [...sharesSnapshotByOwnerId.docs, ...sharesSnapshotByOwnerSnake.docs]
            .filter((doc) => {
                const data = doc.data();
                const status = String(data?.status || '').toLowerCase();
                if (!['ready', 'pending', 'active'].includes(status)) return false;

                const expiresAt = toDate(data?.expiresAt || data?.expires_at);
                if (expiresAt && expiresAt.getTime() <= Date.now()) return false;

                const isEphemeral = data?.is_ephemeral === true || data?.isEphemeral === true;
                const downloads = Number(data?.downloadCount || data?.downloads_count || 0);
                if (isEphemeral && downloads > 0) return false;

                return true;
            }).length;

        const activeShares = Math.max(activeSharesFromQueue, activeSharesFromTransfers, activeSharesFromShares);

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

/**
 * POST /api/user/:userId/shares/:shareId/terminate
 * Terminates/expires an active share
 * - Sets expiresAt to current time
 * - Marks as expired/terminated
 * - Keeps history record but makes it unavailable for download
 */
router.post('/:userId/shares/:shareId/terminate', publicRateLimiter, async (req, res) => {
    try {
        const { userId, shareId } = req.params;

        if (!userId || typeof userId !== 'string') {
            return res.status(400).json({
                success: false,
                error: 'User ID is required',
            });
        }

        if (!shareId || typeof shareId !== 'string') {
            return res.status(400).json({
                success: false,
                error: 'Share ID is required',
            });
        }

        const db = getFirestore();
        const now = new Date();

        // Case 1: If shareId starts with "transfer_", it's from transfers collection
        if (shareId.startsWith('transfer_')) {
            const transferId = shareId.replace('transfer_', '');
            const transferRef = db.collection('transfers').doc(transferId);
            const transferDoc = await transferRef.get();

            if (!transferDoc.exists) {
                return res.status(404).json({
                    success: false,
                    error: 'Share not found',
                });
            }

            const transferData = transferDoc.data();

            // Verify user owns this transfer
            if (transferData.owner_id !== userId) {
                return res.status(403).json({
                    success: false,
                    error: 'Unauthorized',
                });
            }

            // Mark as expired
            await transferRef.update({
                expires_at: now,
                status: 'cancelled',
            });

            // Fetch existing history data to preserve file info
            let existingFileData = { fileName: null, fileType: null, fileSize: 0, totalBytes: 0, durationMs: 0, speedBytesPerSec: 0 };
            try {
                const historyDoc = await db.collection('history').doc(transferId).get();
                if (historyDoc.exists) {
                    const hData = historyDoc.data();
                    existingFileData = {
                        fileName: hData.file?.name || null,
                        fileType: hData.file?.type || null,
                        fileSize: hData.file?.size || 0,
                        totalBytes: hData.totalBytes || 0,
                        durationMs: hData.durationMs || 0,
                        speedBytesPerSec: hData.speedBytesPerSec || 0,
                    };
                } else {
                    // Try active_shares as fallback
                    const activeDoc = await db.collection('active_shares').doc(`internet_${transferId}`).get();
                    if (activeDoc.exists) {
                        const aData = activeDoc.data();
                        existingFileData = {
                            fileName: aData.file?.name || null,
                            fileType: aData.file?.type || null,
                            fileSize: aData.file?.size || 0,
                            totalBytes: aData.totalBytes || 0,
                            durationMs: 0,
                            speedBytesPerSec: 0,
                        };
                    }
                }
            } catch (e) {
                console.warn('Failed to fetch existing file data for termination:', e);
            }

            // Queue analytics event for termination
            enqueueAnalyticsEvent({
                userId,
                transferId,
                shareCode: transferData.share_code || null,
                transferType: 'internet',
                direction: 'send',
                status: 'cancelled',
                retries: 0,
                ...existingFileData,
                metadata: { source: 'share-terminate' },
                clientTimestamp: new Date().toISOString(),
            });

            return res.json({
                success: true,
                version: DATA_VERSION,
                message: 'Share terminated successfully',
            });
        }

        // Case 2: If shareId starts with "share_", it's from shares collection
        if (shareId.startsWith('share_')) {
            const docId = shareId.replace('share_', '');
            const shareRef = db.collection('shares').doc(docId);
            const shareDoc = await shareRef.get();

            if (!shareDoc.exists) {
                return res.status(404).json({
                    success: false,
                    error: 'Share not found',
                });
            }

            const shareData = shareDoc.data();

            // Verify user owns this share (check both camelCase and snake_case)
            if (shareData.ownerId !== userId && shareData.owner_id !== userId) {
                return res.status(403).json({
                    success: false,
                    error: 'Unauthorized',
                });
            }

            // Mark as expired
            await shareRef.update({
                expiresAt: now,
                status: 'cancelled',
                terminated: true,
            });

            // Fetch existing history data to preserve file info
            const shareCode = shareData.shareCode || shareData.code || docId;
            let existingFileData = { fileName: null, fileType: null, fileSize: 0, totalBytes: 0, durationMs: 0, speedBytesPerSec: 0 };
            try {
                const historyDoc = await db.collection('history').doc(shareCode).get();
                if (historyDoc.exists) {
                    const hData = historyDoc.data();
                    existingFileData = {
                        fileName: hData.file?.name || null,
                        fileType: hData.file?.type || null,
                        fileSize: hData.file?.size || 0,
                        totalBytes: hData.totalBytes || 0,
                        durationMs: hData.durationMs || 0,
                        speedBytesPerSec: hData.speedBytesPerSec || 0,
                    };
                } else {
                    // Try active_shares as fallback
                    const activeDoc = await db.collection('active_shares').doc(`internet_${shareCode}`).get();
                    if (activeDoc.exists) {
                        const aData = activeDoc.data();
                        existingFileData = {
                            fileName: aData.file?.name || null,
                            fileType: aData.file?.type || null,
                            fileSize: aData.file?.size || 0,
                            totalBytes: aData.totalBytes || 0,
                            durationMs: 0,
                            speedBytesPerSec: 0,
                        };
                    }
                }
            } catch (e) {
                console.warn('Failed to fetch existing file data for termination:', e);
            }

            // Queue analytics event for termination
            enqueueAnalyticsEvent({
                userId,
                shareCode,
                transferType: 'internet',
                direction: 'send',
                status: 'cancelled',
                retries: 0,
                ...existingFileData,
                metadata: { source: 'share-terminate' },
                clientTimestamp: new Date().toISOString(),
            });

            return res.json({
                success: true,
                version: DATA_VERSION,
                message: 'Share terminated successfully',
            });
        }

        // Case 3: Raw share code (legacy)
        const shareRef = db.collection('shares').doc(shareId);
        const shareDoc = await shareRef.get();

        if (!shareDoc.exists) {
            return res.status(404).json({
                success: false,
                error: 'Share not found',
            });
        }

        const shareData = shareDoc.data();

        // Verify user owns this share
        if (shareData.ownerId !== userId && shareData.owner_id !== userId) {
            return res.status(403).json({
                success: false,
                error: 'Unauthorized',
            });
        }

        // Mark as expired
        await shareRef.update({
            expiresAt: now,
            status: 'cancelled',
            terminated: true,
        });

        // Fetch existing history data to preserve file info
        let existingFileData = { fileName: null, fileType: null, fileSize: 0, totalBytes: 0, durationMs: 0, speedBytesPerSec: 0 };
        try {
            const historyDoc = await db.collection('history').doc(shareId).get();
            if (historyDoc.exists) {
                const hData = historyDoc.data();
                existingFileData = {
                    fileName: hData.file?.name || null,
                    fileType: hData.file?.type || null,
                    fileSize: hData.file?.size || 0,
                    totalBytes: hData.totalBytes || 0,
                    durationMs: hData.durationMs || 0,
                    speedBytesPerSec: hData.speedBytesPerSec || 0,
                };
            } else {
                // Try active_shares as fallback
                const activeDoc = await db.collection('active_shares').doc(`internet_${shareId}`).get();
                if (activeDoc.exists) {
                    const aData = activeDoc.data();
                    existingFileData = {
                        fileName: aData.file?.name || null,
                        fileType: aData.file?.type || null,
                        fileSize: aData.file?.size || 0,
                        totalBytes: aData.totalBytes || 0,
                        durationMs: 0,
                        speedBytesPerSec: 0,
                    };
                }
            }
        } catch (e) {
            console.warn('Failed to fetch existing file data for termination:', e);
        }

        // Queue analytics event for termination
        enqueueAnalyticsEvent({
            userId,
            shareCode: shareId,
            transferType: 'internet',
            direction: 'send',
            status: 'cancelled',
            retries: 0,
            ...existingFileData,
            metadata: { source: 'share-terminate' },
            clientTimestamp: new Date().toISOString(),
        });

        res.json({
            success: true,
            version: DATA_VERSION,
            message: 'Share terminated successfully',
        });
    } catch (error) {
        console.error('Error terminating share:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to terminate share',
            message: error.message,
        });
    }
});

export default router;
