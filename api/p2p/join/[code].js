// /api/p2p/join/[code].js
import admin from 'firebase-admin';

const SESSION_TTL_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Safely initialize Firebase Admin — returns { db, error }
 */
function getDb() {
    try {
        if (admin.apps.length) {
            return { db: admin.firestore(), error: null };
        }
        const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
        if (!serviceAccountKey) {
            return { db: null, error: 'FIREBASE_SERVICE_ACCOUNT_KEY env var is not set' };
        }

        let credentials;
        try {
            const decoded = Buffer.from(serviceAccountKey, 'base64').toString('utf-8');
            credentials = JSON.parse(decoded);
        } catch (parseErr) {
            return { db: null, error: `Failed to parse FIREBASE_SERVICE_ACCOUNT_KEY: ${parseErr.message}` };
        }

        admin.initializeApp({
            credential: admin.credential.cert(credentials),
        });
        return { db: admin.firestore(), error: null };
    } catch (e) {
        console.error('[P2P Join] Firebase init error:', e.message);
        return { db: null, error: `Firebase init failed: ${e.message}` };
    }
}

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method not allowed' });

    try {
        const { db, error: dbError } = getDb();
        if (!db) {
            return res.status(500).json({ success: false, error: `Firebase not available: ${dbError}` });
        }

        const { code } = req.query;
        const upperCode = code.toUpperCase();

        const docRef = db.collection('p2p_sessions').doc(upperCode);
        const doc = await docRef.get();

        if (!doc.exists) {
            return res.status(404).json({
                success: false,
                error: 'Session not found or expired. Check the code and try again.',
            });
        }

        const session = doc.data();

        // Check expiry
        if (session.expiresAt) {
            const expiresAt = session.expiresAt.toDate ? session.expiresAt.toDate() : new Date(session.expiresAt);
            if (new Date() > expiresAt) {
                await docRef.delete();
                return res.status(410).json({ success: false, error: 'Session has expired.' });
            }
        } else if (session.createdAt) {
            const createdAt = session.createdAt.toDate ? session.createdAt.toDate() : new Date(session.createdAt);
            if (Date.now() - createdAt.getTime() > SESSION_TTL_MS) {
                await docRef.delete();
                return res.status(410).json({ success: false, error: 'Session has expired.' });
            }
        }

        await docRef.update({ receiverJoined: true });

        res.json({ success: true, data: { peerId: session.peerId } });
    } catch (error) {
        console.error('Error joining P2P session:', error);
        res.status(500).json({ success: false, error: 'Failed to join session: ' + (error.message || 'Unknown') });
    }
}