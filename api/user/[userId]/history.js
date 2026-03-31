import { db } from '../../_lib/firebase-admin.js';
import { DATA_VERSION, normalizeHistoryRecord } from '../../_lib/analytics.js';

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    try {
        const { userId } = req.query;
        if (!userId || typeof userId !== 'string') {
            return res.status(400).json({ success: false, error: 'User ID is required' });
        }

        const limit = Math.min(Math.max(parseInt(String(req.query.limit || '20'), 10) || 20, 1), 100);
        const cursor = req.query.cursor ? parseInt(String(req.query.cursor), 10) : null;
        const typeFilter = req.query.type ? String(req.query.type).toLowerCase() : null;
        const statusFilter = req.query.status ? String(req.query.status).toLowerCase() : null;

        const snapshot = await db
            .collection('history')
            .where('version', '==', DATA_VERSION)
            .where('userId', '==', userId)
            .limit(2000)
            .get();

        const records = snapshot.docs
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

        return res.json({
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
        return res.status(500).json({ success: false, error: 'Failed to fetch history', message: error.message });
    }
}
