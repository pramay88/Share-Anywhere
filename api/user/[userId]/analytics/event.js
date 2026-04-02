import { db } from '../../../_lib/firebase-admin.js';
import { processAnalyticsEvent } from '../../../_lib/analytics.js';

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    try {
        const { userId } = req.query;
        if (!userId || typeof userId !== 'string') {
            return res.status(400).json({ success: false, error: 'User ID is required' });
        }

        const result = await processAnalyticsEvent(db, req.body || {}, userId);
        return res.status(202).json({ success: true, queued: true, ...result });
    } catch (error) {
        console.error('Error processing user analytics event:', error);
        return res.status(500).json({ success: false, error: 'Failed to queue analytics event', message: error.message });
    }
}
