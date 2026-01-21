import { NextRequest, NextResponse } from 'next/server';
import { RATE_LIMITS } from '@/lib/shared/constants';

interface RateLimitEntry {
    count: number;
    resetTime: number;
}

// In-memory store for rate limiting
// In production, consider using Redis for distributed rate limiting
const rateLimitStore = new Map<string, RateLimitEntry>();

/**
 * Get client identifier (IP address or user ID)
 */
function getClientId(req: NextRequest, userId?: string | null): string {
    if (userId) {
        return `user:${userId}`;
    }

    // Try to get IP from various headers
    const forwarded = req.headers.get('x-forwarded-for');
    const realIp = req.headers.get('x-real-ip');
    const ip = forwarded?.split(',')[0] || realIp || 'unknown';

    return `ip:${ip}`;
}

/**
 * Rate limiting middleware
 */
export function withRateLimit(
    handler: (req: NextRequest) => Promise<NextResponse>,
    options: {
        windowMs: number;
        maxRequests: number;
        keyPrefix?: string;
    }
): (req: NextRequest, userId?: string | null) => Promise<NextResponse> {
    return async (req: NextRequest, userId?: string | null) => {
        const clientId = getClientId(req, userId);
        const key = options.keyPrefix ? `${options.keyPrefix}:${clientId}` : clientId;

        const now = Date.now();
        const entry = rateLimitStore.get(key);

        if (!entry || now > entry.resetTime) {
            // Create new entry or reset expired entry
            rateLimitStore.set(key, {
                count: 1,
                resetTime: now + options.windowMs,
            });

            return handler(req);
        }

        if (entry.count >= options.maxRequests) {
            // Rate limit exceeded
            const retryAfter = Math.ceil((entry.resetTime - now) / 1000);

            return NextResponse.json(
                {
                    success: false,
                    error: {
                        code: 'RATE_LIMIT_EXCEEDED',
                        message: `Too many requests. Please try again in ${retryAfter} seconds.`,
                        details: {
                            retryAfter,
                            limit: options.maxRequests,
                            window: options.windowMs / 1000,
                        },
                    },
                },
                {
                    status: 429,
                    headers: {
                        'Retry-After': retryAfter.toString(),
                        'X-RateLimit-Limit': options.maxRequests.toString(),
                        'X-RateLimit-Remaining': '0',
                        'X-RateLimit-Reset': entry.resetTime.toString(),
                    },
                }
            );
        }

        // Increment count
        entry.count++;
        rateLimitStore.set(key, entry);

        const response = await handler(req);

        // Add rate limit headers to response
        response.headers.set('X-RateLimit-Limit', options.maxRequests.toString());
        response.headers.set('X-RateLimit-Remaining', (options.maxRequests - entry.count).toString());
        response.headers.set('X-RateLimit-Reset', entry.resetTime.toString());

        return response;
    };
}

/**
 * Cleanup expired entries (call periodically)
 */
export function cleanupRateLimitStore(): void {
    const now = Date.now();
    for (const [key, entry] of rateLimitStore.entries()) {
        if (now > entry.resetTime) {
            rateLimitStore.delete(key);
        }
    }
}

// Cleanup every 5 minutes
if (typeof setInterval !== 'undefined') {
    setInterval(cleanupRateLimitStore, 5 * 60 * 1000);
}

/**
 * Predefined rate limiters for common operations
 */
export const rateLimiters = {
    createShare: (handler: (req: NextRequest) => Promise<NextResponse>) =>
        withRateLimit(handler, {
            ...RATE_LIMITS.CREATE_SHARE,
            keyPrefix: 'create_share',
        }),

    getShare: (handler: (req: NextRequest) => Promise<NextResponse>) =>
        withRateLimit(handler, {
            ...RATE_LIMITS.GET_SHARE,
            keyPrefix: 'get_share',
        }),

    consumeShare: (handler: (req: NextRequest) => Promise<NextResponse>) =>
        withRateLimit(handler, {
            ...RATE_LIMITS.CONSUME_SHARE,
            keyPrefix: 'consume_share',
        }),
};
