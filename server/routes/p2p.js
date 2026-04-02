/**
 * P2P Signaling Routes
 * Lightweight in-memory session broker for WebRTC peer pairing via share codes
 */

import express from 'express';
import { enqueueAnalyticsEvent } from '../services/analyticsQueue.js';

const router = express.Router();

// In-memory session store — sessions expire after 10 minutes
const sessions = new Map();
const SESSION_TTL_MS = 10 * 60 * 1000; // 10 minutes

// Cleanup expired sessions every 60 seconds
setInterval(() => {
    const now = Date.now();
    for (const [code, session] of sessions) {
        if (now - session.createdAt > SESSION_TTL_MS) {
            sessions.delete(code);
        }
    }
}, 60 * 1000);

/**
 * Generate a random 6-char alphanumeric code
 */
function generateCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

/**
 * POST /api/p2p/create-session
 * Sender creates a session and gets a share code
 * Body: { peerId: string }
 */
router.post('/create-session', (req, res) => {
    try {
        const { peerId, userId, is_ephemeral } = req.body;
        const isEphemeral = is_ephemeral === true || is_ephemeral === 'true';

        if (!peerId || typeof peerId !== 'string') {
            return res.status(400).json({
                success: false,
                error: 'peerId is required',
            });
        }

        // Generate unique code
        let code;
        let attempts = 0;
        do {
            code = generateCode();
            attempts++;
            if (attempts > 20) {
                return res.status(500).json({
                    success: false,
                    error: 'Failed to generate unique code. Try again.',
                });
            }
        } while (sessions.has(code));

        // Store session
        sessions.set(code, {
            peerId,
            userId: userId || null,
            is_ephemeral: isEphemeral,
            createdAt: Date.now(),
            receiverJoined: false,
        });

        enqueueAnalyticsEvent({
            userId: userId || null,
            shareCode: code,
            transferType: 'p2p',
            direction: 'send',
            status: 'active',
            retries: 0,
            is_ephemeral: isEphemeral,
            metadata: { source: 'p2p-create-session' },
            clientTimestamp: new Date().toISOString(),
        });

        console.log(`🔗 P2P session created: ${code} → ${peerId}`);

        res.json({
            success: true,
            data: {
                code,
                expiresIn: SESSION_TTL_MS / 1000,
            },
        });
    } catch (error) {
        console.error('Error creating P2P session:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to create session',
        });
    }
});

/**
 * GET /api/p2p/join/:code
 * Receiver joins a session by code, gets sender's peer ID
 */
router.get('/join/:code', (req, res) => {
    try {
        const { code } = req.params;
        const upperCode = code.toUpperCase();

        const session = sessions.get(upperCode);

        if (!session) {
            return res.status(404).json({
                success: false,
                error: 'Session not found or expired. Check the code and try again.',
            });
        }

        // Check expiry
        if (Date.now() - session.createdAt > SESSION_TTL_MS) {
            sessions.delete(upperCode);
            return res.status(410).json({
                success: false,
                error: 'Session has expired. Ask the sender for a new code.',
            });
        }

        session.receiverJoined = true;

        enqueueAnalyticsEvent({
            userId: session.userId || null,
            shareCode: upperCode,
            transferType: 'p2p',
            direction: 'receive',
            status: 'active',
            retries: 0,
            is_ephemeral: session.is_ephemeral === true,
            metadata: { source: 'p2p-join-session' },
            clientTimestamp: new Date().toISOString(),
        });

        console.log(`🤝 Receiver joined session: ${upperCode}`);

        res.json({
            success: true,
            data: {
                peerId: session.peerId,
            },
        });
    } catch (error) {
        console.error('Error joining P2P session:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to join session',
        });
    }
});

/**
 * DELETE /api/p2p/session/:code
 * Cleanup session after transfer completes
 */
router.delete('/session/:code', (req, res) => {
    try {
        const { code } = req.params;
        const upperCode = code.toUpperCase();

        const existed = sessions.delete(upperCode);

        if (existed) {
            enqueueAnalyticsEvent({
                shareCode: upperCode,
                transferType: 'p2p',
                direction: 'send',
                status: 'cancelled',
                retries: 0,
                is_ephemeral: false,
                metadata: { source: 'p2p-delete-session' },
                clientTimestamp: new Date().toISOString(),
            });
        }

        if (existed) {
            console.log(`🧹 P2P session cleaned up: ${upperCode}`);
        }

        res.json({
            success: true,
            message: existed ? 'Session deleted' : 'Session not found (already expired)',
        });
    } catch (error) {
        console.error('Error deleting P2P session:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to delete session',
        });
    }
});

/**
 * GET /api/p2p/session/:code/status
 * Check session status (sender can poll to see if receiver joined)
 */
router.get('/session/:code/status', (req, res) => {
    try {
        const { code } = req.params;
        const upperCode = code.toUpperCase();

        const session = sessions.get(upperCode);

        if (!session) {
            return res.status(404).json({
                success: false,
                error: 'Session not found',
            });
        }

        if (Date.now() - session.createdAt > SESSION_TTL_MS) {
            sessions.delete(upperCode);
            return res.status(410).json({
                success: false,
                error: 'Session expired',
            });
        }

        res.json({
            success: true,
            data: {
                receiverJoined: session.receiverJoined,
                createdAt: session.createdAt,
                expiresAt: session.createdAt + SESSION_TTL_MS,
            },
        });
    } catch (error) {
        console.error('Error checking session status:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to check session status',
        });
    }
});

export default router;
