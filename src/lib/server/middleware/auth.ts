import { NextRequest, NextResponse } from 'next/server';
import { verifyIdToken } from '../firebase/admin';

export interface AuthContext {
    userId: string | null;
    isAuthenticated: boolean;
}

/**
 * Authentication middleware
 * Extracts and verifies Firebase ID token from Authorization header
 * Supports optional authentication (for anonymous shares)
 */
export async function withAuth(
    handler: (req: NextRequest, auth: AuthContext) => Promise<NextResponse>,
    options: { required?: boolean } = {}
): Promise<(req: NextRequest) => Promise<NextResponse>> {
    return async (req: NextRequest) => {
        const authHeader = req.headers.get('Authorization');

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            // No auth token provided
            if (options.required) {
                return NextResponse.json(
                    {
                        success: false,
                        error: {
                            code: 'AUTHENTICATION_ERROR',
                            message: 'Authentication required. Please provide a valid token.',
                        },
                    },
                    { status: 401 }
                );
            }

            // Optional auth - proceed without user ID
            return handler(req, { userId: null, isAuthenticated: false });
        }

        const token = authHeader.substring(7); // Remove 'Bearer ' prefix

        try {
            const decodedToken = await verifyIdToken(token);
            return handler(req, { userId: decodedToken.uid, isAuthenticated: true });
        } catch (error) {
            if (options.required) {
                return NextResponse.json(
                    {
                        success: false,
                        error: {
                            code: 'AUTHENTICATION_ERROR',
                            message: 'Invalid or expired authentication token.',
                        },
                    },
                    { status: 401 }
                );
            }

            // Optional auth - proceed without user ID even if token is invalid
            return handler(req, { userId: null, isAuthenticated: false });
        }
    };
}

/**
 * Extract user ID from request headers (for use in API routes)
 */
export async function getUserIdFromRequest(req: NextRequest): Promise<string | null> {
    const authHeader = req.headers.get('Authorization');

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return null;
    }

    const token = authHeader.substring(7);

    try {
        const decodedToken = await verifyIdToken(token);
        return decodedToken.uid;
    } catch (error) {
        return null;
    }
}
