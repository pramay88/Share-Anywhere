/**
 * Share Routes
 * Production-ready API with direct Cloudinary uploads
 */

import express from 'express';
import { getFirestore } from '../config/firebase.js';
import { generateUploadSignature, getFileUrl } from '../services/uploadService.js';
import { validateApiKey, createRateLimiter, publicRateLimiter } from '../middleware/auth.js';
import { cleanupExpiredShares, permanentlyDeleteOldShares } from '../services/cleanupService.js';

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
        const { contentType, content, fileName, fileSize, mimeType } = req.body;

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
            shareCode,
            contentType,
            createdAt,
            expiresAt,
            consumed: false,
            status: 'pending',
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

        // Redirect to Cloudinary CDN
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
