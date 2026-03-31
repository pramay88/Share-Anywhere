import { db } from '../../_lib/firebase-admin.js';
import { DATA_VERSION, toDate } from '../../_lib/analytics.js';

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    try {
        const { userId } = req.query;
        if (!userId || typeof userId !== 'string') {
            return res.status(400).json({ success: false, error: 'User ID is required' });
        }

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

        return res.json({
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
        return res.status(500).json({ success: false, error: 'Failed to fetch stats', message: error.message });
    }
}
