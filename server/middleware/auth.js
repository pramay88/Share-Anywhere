/**
 * Authentication Middleware
 * API key validation and rate limiting
 */

import rateLimit from 'express-rate-limit';
import crypto from 'crypto';

/**
 * Validate API key from request header
 */
export function validateApiKey(req, res, next) {
    const apiKey = req.headers['x-api-key'];
    const validApiKey = process.env.API_SECRET_KEY;

    if (!validApiKey) {
        console.error('❌ API_SECRET_KEY not configured in environment');
        return res.status(500).json({
            success: false,
            error: 'Server configuration error',
        });
    }

    if (!apiKey) {
        return res.status(401).json({
            success: false,
            error: 'API key required. Include X-API-Key header.',
        });
    }

    // Constant-time comparison to prevent timing attacks
    const apiKeyBuffer = Buffer.from(apiKey);
    const validKeyBuffer = Buffer.from(validApiKey);

    if (apiKeyBuffer.length !== validKeyBuffer.length) {
        return res.status(403).json({
            success: false,
            error: 'Invalid API key',
        });
    }

    const isValid = crypto.timingSafeEqual(apiKeyBuffer, validKeyBuffer);

    if (!isValid) {
        return res.status(403).json({
            success: false,
            error: 'Invalid API key',
        });
    }

    next();
}

/**
 * Rate limiter for creation endpoints
 * 20 requests per 15 minutes
 */
export const createRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 20, // 20 requests per window
    message: {
        success: false,
        error: 'Too many requests. Please try again later.',
    },
    standardHeaders: true, // Return rate limit info in headers
    legacyHeaders: false,
});

/**
 * Rate limiter for public endpoints
 * 100 requests per 15 minutes
 */
export const publicRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: {
        success: false,
        error: 'Too many requests. Please try again later.',
    },
    standardHeaders: true,
    legacyHeaders: false,
});

export default {
    validateApiKey,
    createRateLimiter,
    publicRateLimiter,
};
