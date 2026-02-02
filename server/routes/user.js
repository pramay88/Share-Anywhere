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

        // Query shares owned by this user (simple query without composite index)
        const sharesSnapshot = await db
            .collection('shares')
            .where('ownerId', '==', userId)
            .get();

        const shares = [];
        sharesSnapshot.forEach((doc) => {
            const data = doc.data();

            // Filter by date in memory to avoid needing composite index
            const createdAt = data.createdAt?.toDate();
            if (!createdAt || createdAt < twentyFourHoursAgo) {
                return; // Skip shares older than 24 hours
            }

            const expiresAt = data.expiresAt?.toDate();
            const isExpired = expiresAt && expiresAt < now;

            shares.push({
                code: data.shareCode,
                type: data.contentType,
                fileName: data.fileName || null,
                content: data.content || null,
                size: data.fileSize || 0,
                mimeType: data.mimeType || null,
                createdAt: createdAt.toISOString(),
                expiresAt: expiresAt ? expiresAt.toISOString() : null,
                status: isExpired ? 'expired' : 'active',
                downloadCount: data.downloadCount || 0,
                cloudinaryPublicId: data.cloudinaryPublicId || null,
            });
        });

        // Sort by creation date (newest first) in memory
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

        // Check if stats document exists
        const statsDoc = await db.collection('userStats').doc(userId).get();

        if (statsDoc.exists) {
            const stats = statsDoc.data();
            return res.json({
                success: true,
                stats: {
                    totalSends: stats.totalSends || 0,
                    totalReceives: stats.totalReceives || 0,
                    totalDataShared: stats.totalDataShared || 0,
                    activeShares: stats.activeShares || 0,
                    lastUpdated: stats.lastUpdated?.toDate().toISOString() || null,
                },
            });
        }

        // If no stats exist yet, return zeros
        res.json({
            success: true,
            stats: {
                totalSends: 0,
                totalReceives: 0,
                totalDataShared: 0,
                activeShares: 0,
                lastUpdated: null,
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
