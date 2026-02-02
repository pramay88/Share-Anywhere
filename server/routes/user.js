/**
 * User Stats and History Routes
 */

import express from 'express';
import { getFirestore } from '../config/firebase.js';
import { validateApiKey, publicRateLimiter } from '../middleware/auth.js';

const router = express.Router();

/**
 * GET /api/user/:userId/history
 * Get user's share history (last 24 hours)
 * Public endpoint (user can only access their own history via frontend auth)
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

        const db = getFirestore();
        const now = new Date();
        const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

        // Query transfers owned by this user (using actual schema: transfers collection)
        const transfersSnapshot = await db
            .collection('transfers')
            .where('owner_id', '==', userId)
            .get();

        const shares = [];

        // Process each transfer
        for (const doc of transfersSnapshot.docs) {
            const data = doc.data();

            // Filter by date in memory
            const createdAt = data.created_at?.toDate();
            if (!createdAt || createdAt < twentyFourHoursAgo) {
                continue; // Skip transfers older than 24 hours
            }

            const expiresAt = data.expires_at?.toDate();
            const isExpired = expiresAt && expiresAt < now;

            // Get files for this transfer
            const filesSnapshot = await db
                .collection('transfers')
                .doc(doc.id)
                .collection('files')
                .get();

            const files = filesSnapshot.docs.map(f => f.data());
            const totalSize = files.reduce((sum, f) => sum + (f.file_size || 0), 0);

            shares.push({
                code: data.share_code,
                type: data.content_type === 'text' ? 'text' : 'file',
                fileName: files.length > 0 ? files[0].original_name : (data.text_content ? 'Text' : null),
                content: data.text_content || null,
                size: totalSize || (data.text_content?.length || 0),
                mimeType: files.length > 0 ? files[0].mime_type : 'text/plain',
                createdAt: createdAt.toISOString(),
                expiresAt: expiresAt ? expiresAt.toISOString() : null,
                status: isExpired ? 'expired' : 'active',
                downloadCount: 0, // Not tracked in current schema
                cloudinaryPublicId: files.length > 0 ? files[0].cloudinary_public_id : null,
            });
        }

        // Sort by creation date (newest first)
        shares.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

        res.json({
            success: true,
            shares,
            count: shares.length,
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
 * Get user statistics
 * Public endpoint (user can only access their own stats via frontend auth)
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

        // Count user's transfers for stats
        const transfersSnapshot = await db
            .collection('transfers')
            .where('owner_id', '==', userId)
            .get();

        const now = new Date();
        let totalSends = 0;
        let activeShares = 0;
        let totalDataShared = 0;

        for (const doc of transfersSnapshot.docs) {
            const data = doc.data();
            totalSends++;

            // Check if active
            const expiresAt = data.expires_at?.toDate();
            if (!expiresAt || expiresAt > now) {
                activeShares++;
            }

            // Get files to calculate total data
            const filesSnapshot = await db
                .collection('transfers')
                .doc(doc.id)
                .collection('files')
                .get();

            filesSnapshot.docs.forEach(f => {
                totalDataShared += f.data().file_size || 0;
            });
        }

        res.json({
            success: true,
            stats: {
                totalSends,
                totalReceives: 0, // Not tracked in current schema
                totalDataShared,
                activeShares,
                lastUpdated: new Date().toISOString(),
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
 * Increment user statistics
 * Protected: Requires API key
 */
router.post('/:userId/stats/increment', validateApiKey, async (req, res) => {
    try {
        const { userId } = req.params;
        const { field, value } = req.body;

        if (!userId) {
            return res.status(400).json({
                success: false,
                error: 'User ID is required',
            });
        }

        if (!field || !['totalSends', 'totalReceives', 'totalDataShared', 'activeShares'].includes(field)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid field. Must be totalSends, totalReceives, totalDataShared, or activeShares',
            });
        }

        const db = getFirestore();
        const statsRef = db.collection('userStats').doc(userId);
        const statsDoc = await statsRef.get();

        const incrementValue = typeof value === 'number' ? value : 1;
        const now = new Date();

        if (statsDoc.exists) {
            // Update existing stats
            const currentStats = statsDoc.data();
            await statsRef.update({
                [field]: (currentStats[field] || 0) + incrementValue,
                lastUpdated: now,
            });
        } else {
            // Create new stats document
            await statsRef.set({
                totalSends: field === 'totalSends' ? incrementValue : 0,
                totalReceives: field === 'totalReceives' ? incrementValue : 0,
                totalDataShared: field === 'totalDataShared' ? incrementValue : 0,
                activeShares: field === 'activeShares' ? incrementValue : 0,
                lastUpdated: now,
            });
        }

        res.json({
            success: true,
            message: 'Stats updated successfully',
        });
    } catch (error) {
        console.error('Error updating user stats:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update stats',
            message: error.message,
        });
    }
});

export default router;
