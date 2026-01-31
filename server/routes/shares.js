/**
 * Share Routes
 * API endpoints for creating and retrieving shares
 */

import express from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import { getFirestore } from '../config/firebase.js';

const router = express.Router();

// Configure multer for file uploads (memory storage)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 50 * 1024 * 1024, // 50MB limit
    },
});

// Rate limiting
const createShareLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 20, // 20 requests per window
    message: { success: false, error: 'Too many requests, please try again later' },
});

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
 * Create a new share
 */
router.post('/create', createShareLimiter, upload.single('file'), async (req, res) => {
    try {
        const { contentType, content, expiresInHours = 24 } = req.body;

        // Validate content type
        if (!['text', 'url', 'file'].includes(contentType)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid content type. Must be text, url, or file.',
            });
        }

        // Generate unique share code
        const shareCode = await generateUniqueShareCode();

        // Calculate expiration
        const expiresAt = new Date(Date.now() + parseInt(expiresInHours) * 60 * 60 * 1000);

        const db = getFirestore();
        const shareData = {
            shareCode,
            contentType,
            createdAt: new Date(),
            expiresAt,
            consumed: false,
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
        } else if (contentType === 'file') {
            if (!req.file) {
                return res.status(400).json({
                    success: false,
                    error: 'File is required for file shares',
                });
            }

            // For now, store file as base64 in Firestore
            // TODO: Upload to Cloudinary for production
            shareData.fileName = req.file.originalname;
            shareData.fileSize = req.file.size;
            shareData.mimeType = req.file.mimetype;
            shareData.fileData = req.file.buffer.toString('base64');
        }

        // Save to Firestore
        await db.collection('shares').doc(shareCode).set(shareData);

        const shareUrl = `${process.env.APP_URL || 'http://localhost:8080'}/receive?code=${shareCode}`;

        res.json({
            success: true,
            data: {
                shareCode,
                shareUrl,
                expiresAt: expiresAt.toISOString(),
                createdAt: new Date().toISOString(),
            },
        });
    } catch (error) {
        console.error('Error creating share:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to create share. Please try again.',
        });
    }
});

/**
 * GET /api/shares/:code
 * Get share by code
 */
router.get('/:code', async (req, res) => {
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

        // Check if already consumed
        if (shareData.consumed) {
            return res.status(410).json({
                success: false,
                error: 'Share has already been consumed',
            });
        }

        res.json({
            success: true,
            data: {
                contentType: shareData.contentType,
                content: shareData.content,
                fileName: shareData.fileName,
                fileSize: shareData.fileSize,
                mimeType: shareData.mimeType,
                fileData: shareData.fileData,
                expiresAt: shareData.expiresAt.toDate().toISOString(),
            },
        });
    } catch (error) {
        console.error('Error getting share:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get share',
        });
    }
});

/**
 * POST /api/shares/:code/consume
 * Mark share as consumed
 */
router.post('/:code/consume', async (req, res) => {
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

export default router;
