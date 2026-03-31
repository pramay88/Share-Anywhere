/**
 * Share Routes
 * Production-ready API with direct Cloudinary uploads
 */

import express from 'express';
import { getFirestore } from '../config/firebase.js';
import { generateUploadSignature, getFileUrl } from '../services/uploadService.js';
import { validateApiKey, createRateLimiter, publicRateLimiter } from '../middleware/auth.js';
import { cleanupExpiredShares, permanentlyDeleteOldShares } from '../services/cleanupService.js';
import { enqueueAnalyticsEvent } from '../services/analyticsQueue.js';

const router = express.Router();

/**
 * Generate unique share code
 */
function generateShareCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

/**
 * Check if share code is unique
 */
async function isShareCodeUnique(code) {
    const db = getFirestore();
    const doc = await db.collection('shares').doc(code).get();
    return !doc.exists;
}

/**
 * Generate unique share code
 */
async function generateUniqueShareCode() {
    let code;
    let attempts = 0;
    const maxAttempts = 10;

    do {
        code = generateShareCode();
        attempts++;
        if (attempts >= maxAttempts) {
            throw new Error('Failed to generate unique share code');
        }
    } while (!(await isShareCodeUnique(code)));

    return code;
}

/**
 * POST /api/shares/create
 * Generate upload signature and create share metadata
 * Protected: Requires API key
 */
router.post('/create', validateApiKey, createRateLimiter, async (req, res) => {
    try {
        const { contentType, content, fileName, fileSize, mimeType, ownerId, visibility, is_ephemeral } = req.body;
        const isEphemeral = is_ephemeral === true || is_ephemeral === 'true';

        // Validate content type
        if (!['text', 'url', 'file'].includes(contentType)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid content type. Must be text, url, or file.',
            });
        }

        // Generate unique share code
        const shareCode = await generateUniqueShareCode();

        // Calculate expiry (24 hours)
        const createdAt = new Date();
        const expiresAt = new Date(createdAt.getTime() + 24 * 60 * 60 * 1000);

        const db = getFirestore();
        const shareData = {
            version: 2,
            shareCode,
            contentType,
            createdAt,
            expiresAt,
            consumed: false,
            status: 'pending',
            ownerId: ownerId || null,  // Optional: null for anonymous users
            visibility: visibility || 'private',  // Default to private
            downloadCount: 0,  // Track number of downloads
            is_ephemeral: isEphemeral,
        };

        // Handle different content types
        if (contentType === 'text' || contentType === 'url') {
            if (!content) {
                return res.status(400).json({
                    success: false,
                    error: 'Content is required for text/url shares',
                });
            }
            shareData.content = content;
            shareData.status = 'ready';
        } else if (contentType === 'file') {
            if (!fileName) {
                return res.status(400).json({
                    success: false,
                    error: 'fileName is required for file shares',
                });
            }

            // Generate Cloudinary upload signature
            const uploadSignature = generateUploadSignature(shareCode, fileName);

            shareData.fileName = fileName;
            shareData.fileSize = fileSize || 0;
            shareData.mimeType = mimeType || 'application/octet-stream';
            shareData.cloudinaryPublicId = uploadSignature.publicId;
            shareData.status = 'pending'; // Will be updated to 'ready' after upload
        }

        // Save to Firestore
        await db.collection('shares').doc(shareCode).set(shareData);

        enqueueAnalyticsEvent({
            userId: ownerId || null,
            shareCode,
            transferType: 'internet',
            direction: 'send',
            status: shareData.status === 'ready' ? 'active' : 'pending',
            fileName: fileName || (contentType === 'text' ? 'Text snippet' : null),
            fileType: mimeType || (contentType === 'text' ? 'text/plain' : null),
            fileSize: fileSize || 0,
            totalBytes: fileSize || (typeof content === 'string' ? Buffer.byteLength(content, 'utf8') : 0),
            retries: 0,
            is_ephemeral: shareData.is_ephemeral,
            metadata: { source: 'shares-create' },
            clientTimestamp: createdAt.toISOString(),
        });

        const shareUrl = `${process.env.APP_URL || 'http://localhost:8080'}/receive?code=${shareCode}`;

        // Response
        const response = {
            success: true,
            data: {
                shareCode,
                shareUrl,
                expiresAt: expiresAt.toISOString(),
                createdAt: createdAt.toISOString(),
            },
        };

        // Include upload signature for file shares
        if (contentType === 'file') {
            const uploadSignature = generateUploadSignature(shareCode, fileName);
            response.data.uploadSignature = uploadSignature;
        }

        res.json(response);
    } catch (error) {
        console.error('Error creating share:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to create share. Please try again.',
        });
    }
});

/**
 * POST /api/shares/:code/complete
 * Mark file upload as complete
 * Protected: Requires API key
 */
router.post('/:code/complete', validateApiKey, createRateLimiter, async (req, res) => {
    try {
        const { code } = req.params;
        const { cloudinaryPublicId, cloudinaryUrl } = req.body;

        if (!cloudinaryPublicId) {
            return res.status(400).json({
                success: false,
                error: 'cloudinaryPublicId is required',
            });
        }

        const db = getFirestore();
        const docRef = db.collection('shares').doc(code);
        const doc = await docRef.get();

        if (!doc.exists) {
            return res.status(404).json({
                success: false,
                error: 'Share not found',
            });
        }

        const shareData = doc.data();

        if (shareData.status !== 'pending') {
            return res.status(400).json({
                success: false,
                error: 'Share is not pending upload',
            });
        }

        // Update share with Cloudinary details
        await docRef.update({
            cloudinaryPublicId,
            cloudinaryUrl: cloudinaryUrl || getFileUrl(cloudinaryPublicId),
            status: 'ready',
            uploadedAt: new Date(),
        });

        enqueueAnalyticsEvent({
            userId: shareData.ownerId || null,
            shareCode: code,
            transferType: 'internet',
            direction: 'send',
            status: 'active',
            fileName: shareData.fileName || null,
            fileType: shareData.mimeType || null,
            fileSize: shareData.fileSize || 0,
            totalBytes: shareData.fileSize || 0,
            retries: 0,
            is_ephemeral: shareData.is_ephemeral === true,
            metadata: { source: 'shares-complete' },
            clientTimestamp: new Date().toISOString(),
        });

        res.json({
            success: true,
            message: 'Upload completed successfully',
        });
    } catch (error) {
        console.error('Error completing upload:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to complete upload',
        });
    }
});

/**
 * GET /api/shares/:code
 * Get share metadata and content
 * Public: No API key required
 */
router.get('/:code', publicRateLimiter, async (req, res) => {
    try {
        const { code } = req.params;

        const db = getFirestore();
        const doc = await db.collection('shares').doc(code).get();

        if (!doc.exists) {
            return res.status(404).json({
                success: false,
                error: 'Share not found',
            });
        }

        const shareData = doc.data();

        // Check if expired
        if (shareData.expiresAt.toDate() < new Date()) {
            return res.status(410).json({
                success: false,
                error: 'Share has expired',
            });
        }

        // Check if deleted
        if (shareData.status === 'deleted') {
            return res.status(410).json({
                success: false,
                error: 'Share has been deleted',
            });
        }

        // Check if ready
        if (shareData.status === 'pending') {
            return res.status(202).json({
                success: false,
                error: 'Upload in progress. Please try again in a moment.',
            });
        }

        // Build response
        const response = {
            success: true,
            data: {
                contentType: shareData.contentType,
                expiresAt: shareData.expiresAt.toDate().toISOString(),
                consumed: shareData.consumed,
            },
        };

        // Include content for text/url
        if (shareData.contentType === 'text' || shareData.contentType === 'url') {
            response.data.content = shareData.content;
        }

        // Include file metadata
        if (shareData.contentType === 'file') {
            response.data.fileName = shareData.fileName;
            response.data.fileSize = shareData.fileSize;
            response.data.mimeType = shareData.mimeType;
            // Don't include Cloudinary URL here - use download endpoint
        }

        res.json(response);
    } catch (error) {
        console.error('Error getting share:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get share',
        });
    }
});

/**
 * GET /api/shares/:code/download
 * Redirect to Cloudinary CDN for file download
 * Public: No API key required
 */
router.get('/:code/download', publicRateLimiter, async (req, res) => {
    try {
        const { code } = req.params;

        const db = getFirestore();
        const doc = await db.collection('shares').doc(code).get();

        if (!doc.exists) {
            return res.status(404).json({
                success: false,
                error: 'Share not found',
            });
        }

        const shareData = doc.data();

        // Check if expired
        if (shareData.expiresAt.toDate() < new Date()) {
            return res.status(410).json({
                success: false,
                error: 'Share has expired',
            });
        }

        // Check if deleted
        if (shareData.status === 'deleted') {
            return res.status(410).json({
                success: false,
                error: 'Share has been deleted',
            });
        }

        // Check if file share
        if (shareData.contentType !== 'file') {
            return res.status(400).json({
                success: false,
                error: 'This share is not a file',
            });
        }

        // Check if ready
        if (shareData.status === 'pending') {
            return res.status(202).json({
                success: false,
                error: 'Upload in progress. Please try again in a moment.',
            });
        }

        // Get Cloudinary URL
        const cloudinaryUrl = shareData.cloudinaryUrl || getFileUrl(shareData.cloudinaryPublicId);

        // Increment download count
        await doc.ref.update({
            downloadCount: (shareData.downloadCount || 0) + 1,
        });

        const nextDownloadCount = (shareData.downloadCount || 0) + 1;

        // Single-use behavior for ephemeral shares.
        if (shareData.is_ephemeral === true) {
            await doc.ref.update({
                consumed: true,
                consumedAt: new Date(),
                status: 'deleted',
            });
        }

        // If share has an owner, increment their receive stats
        if (shareData.ownerId) {
            try {
                const statsRef = db.collection('userStats').doc(shareData.ownerId);
                const statsDoc = await statsRef.get();

                if (statsDoc.exists) {
                    await statsRef.update({
                        totalReceives: (statsDoc.data().totalReceives || 0) + 1,
                        lastUpdated: new Date(),
                    });
                } else {
                    await statsRef.set({
                        totalSends: 0,
                        totalReceives: 1,
                        totalDataShared: 0,
                        activeShares: 0,
                        lastUpdated: new Date(),
                    });
                }
            } catch (statsError) {
                console.error('Error updating user stats:', statsError);
            }
        }

        // Redirect to Cloudinary CDN
        enqueueAnalyticsEvent({
            userId: shareData.ownerId || null,
            shareCode: code,
            transferType: 'internet',
            direction: 'receive',
            status: 'success',
            fileName: shareData.fileName || null,
            fileType: shareData.mimeType || null,
            fileSize: shareData.fileSize || 0,
            totalBytes: shareData.fileSize || 0,
            retries: 0,
            downloadsIncrement: 1,
            is_ephemeral: shareData.is_ephemeral === true,
            metadata: {
                source: 'shares-download',
                downloads_count: nextDownloadCount,
            },
            clientTimestamp: new Date().toISOString(),
        });

        res.redirect(302, cloudinaryUrl);
    } catch (error) {
        console.error('Error downloading file:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to download file',
        });
    }
});

/**
 * POST /api/shares/:code/consume
 * Mark share as consumed
 * Public: No API key required
 */
router.post('/:code/consume', publicRateLimiter, async (req, res) => {
    try {
        const { code } = req.params;

        const db = getFirestore();
        await db.collection('shares').doc(code).update({
            consumed: true,
            consumedAt: new Date(),
        });

        enqueueAnalyticsEvent({
            shareCode: code,
            transferType: 'internet',
            direction: 'receive',
            status: 'success',
            retries: 0,
            downloadsIncrement: 1,
            metadata: { source: 'shares-consume' },
            clientTimestamp: new Date().toISOString(),
        });

        res.json({
            success: true,
            message: 'Share marked as consumed',
        });
    } catch (error) {
        console.error('Error consuming share:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to consume share',
        });
    }
});

/**
 * POST /api/cleanup/expired
 * Cleanup expired shares (cron endpoint)
 * Protected: Requires API key
 */
router.post('/cleanup/expired', validateApiKey, async (req, res) => {
    try {
        const results = await cleanupExpiredShares();

        res.json({
            success: true,
            message: 'Cleanup completed',
            data: results,
        });
    } catch (error) {
        console.error('Error during cleanup:', error);
        res.status(500).json({
            success: false,
            error: 'Cleanup failed',
        });
    }
});

/**
 * POST /api/cleanup/permanent
 * Permanently delete old shares (cron endpoint)
 * Protected: Requires API key
 */
router.post('/cleanup/permanent', validateApiKey, async (req, res) => {
    try {
        const results = await permanentlyDeleteOldShares();

        res.json({
            success: true,
            message: 'Permanent deletion completed',
            data: results,
        });
    } catch (error) {
        console.error('Error during permanent deletion:', error);
        res.status(500).json({
            success: false,
            error: 'Permanent deletion failed',
        });
    }
});

export default router;
