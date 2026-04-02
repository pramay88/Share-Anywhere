import { db } from '../../_lib/firebase-admin.js';
import { DATA_VERSION, toDate } from '../../_lib/analytics.js';

/**
 * GET /api/user/[userId]/stats
 * 
 * Returns user statistics computed from:
 * 1. `analytics_users/{userId}` - Aggregated transfer metrics
 * 2. `shares` collection - Count of active shares
 * 
 * Stats include:
 * - totalSends: Number of completed sends (from analytics)
 * - totalReceives: Number of downloads of user's shares
 * - totalDataShared: Total bytes transferred
 * - activeShares: Current active/ready shares count
 * - averageSpeedBytesPerSec: Weighted average = total_bytes / total_duration
 */
export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    try {
        const { userId } = req.query;
        if (!userId || typeof userId !== 'string') {
            return res.status(400).json({ success: false, error: 'User ID is required' });
        }

        const now = Date.now();

        // Fetch analytics and active shares in parallel
        const [analyticsDoc, sharesSnapshotByOwnerId, sharesSnapshotByOwnerSnake] = await Promise.all([
            db.collection('analytics_users').doc(userId).get(),
            db.collection('shares')
                .where('ownerId', '==', userId)
                .limit(1000)
                .get(),
            db.collection('shares')
                .where('owner_id', '==', userId)
                .limit(1000)
                .get(),
        ]);

        // Get analytics data
        const analytics = analyticsDoc.exists ? analyticsDoc.data() : {};
        const totalTransfers = Number(analytics?.total_transfers || 0);
        const totalBytes = Number(analytics?.total_bytes || 0);
        const totalDuration = Number(analytics?.total_duration || 0); // in milliseconds
        const totalDownloads = Number(analytics?.total_downloads || 0);
        const totalFailures = Number(analytics?.total_failures || 0);
        const totalRetries = Number(analytics?.total_retries || 0);

        // Calculate weighted average speed: total_bytes / total_duration_in_seconds
        const avgSpeed = totalDuration > 0 && totalBytes > 0
            ? Math.round(totalBytes / (totalDuration / 1000))
            : 0;

        // Deduplicate shares and count active ones
        const seenIds = new Set();
        let activeSharesCount = 0;
        let sharesTotal = 0;
        let sharesTotalBytes = 0;
        let sharesTotalDownloads = 0;

        for (const doc of [...sharesSnapshotByOwnerId.docs, ...sharesSnapshotByOwnerSnake.docs]) {
            if (seenIds.has(doc.id)) continue;
            seenIds.add(doc.id);
            
            const data = doc.data();
            sharesTotal++;
            sharesTotalBytes += Number(data.fileSize || 0);
            sharesTotalDownloads += Number(data.downloadCount || data.downloads_count || 0);

            const status = String(data.status || '').toLowerCase();
            
            // Count as active only if ready/pending/active AND not expired AND not consumed ephemeral
            if (['ready', 'pending', 'active'].includes(status)) {
                const expiresAt = toDate(data.expiresAt || data.expires_at);
                const isExpired = expiresAt && expiresAt.getTime() <= now;
                
                const isEphemeral = data.is_ephemeral === true || data.isEphemeral === true;
                const downloads = Number(data.downloadCount || data.downloads_count || 0);
                const isConsumedEphemeral = isEphemeral && downloads > 0;
                
                if (!isExpired && !isConsumedEphemeral) {
                    activeSharesCount++;
                }
            }
        }

        // If analytics has no data, fall back to shares data
        const effectiveTotalSends = totalTransfers > 0 ? totalTransfers : sharesTotal;
        const effectiveTotalBytes = totalBytes > 0 ? totalBytes : sharesTotalBytes;
        const effectiveTotalDownloads = totalDownloads > 0 ? totalDownloads : sharesTotalDownloads;

        return res.json({
            success: true,
            version: DATA_VERSION,
            stats: {
                totalSends: effectiveTotalSends,
                totalReceives: effectiveTotalDownloads,
                totalDataShared: effectiveTotalBytes,
                activeShares: activeSharesCount,
                totalFailures,
                totalRetries,
                averageSpeedBytesPerSec: avgSpeed,
                // Raw values for debugging
                total_bytes: effectiveTotalBytes,
                total_duration: totalDuration,
                total_transfers: effectiveTotalSends,
                lastUpdated: toDate(analytics?.updatedAt)?.toISOString() || new Date().toISOString(),
            },
        });
    } catch (error) {
        console.error('Error fetching user stats:', error);
        return res.status(500).json({ success: false, error: 'Failed to fetch stats', message: error.message });
    }
}
