import admin from 'firebase-admin';

const SESSION_TTL_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Safely initialize Firebase Admin
 */
function getDb() {
    if (!admin.apps.length) {
        const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
        if (!serviceAccountKey) {
            return null;
        }
        try {
            const credentials = JSON.parse(Buffer.from(serviceAccountKey, 'base64').toString());
            admin.initializeApp({
                credential: admin.credential.cert(credentials),
            });
        } catch (e) {
            console.error('Firebase init error:', e);
            return null;
        }
    }
    return admin.firestore();
}

export default async function handler(req, res) {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'GET') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    try {
        const db = getDb();
        if (!db) {
            return res.status(500).json({
                success: false,
                error: 'Server configuration error: Firebase not initialized.',
            });
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

        // Check expiry using expiresAt or createdAt
        if (session.expiresAt) {
            const expiresAt = session.expiresAt.toDate ? session.expiresAt.toDate() : new Date(session.expiresAt);
            if (new Date() > expiresAt) {
                await docRef.delete();
                return res.status(410).json({
                    success: false,
                    error: 'Session has expired. Ask the sender for a new code.',
                });
            }
        } else if (session.createdAt) {
            const createdAt = session.createdAt.toDate ? session.createdAt.toDate() : new Date(session.createdAt);
            if (Date.now() - createdAt.getTime() > SESSION_TTL_MS) {
                await docRef.delete();
                return res.status(410).json({
                    success: false,
                    error: 'Session has expired. Ask the sender for a new code.',
                });
            }
        }

        // Update receiverJoined
        await docRef.update({ receiverJoined: true });

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
            error: 'Failed to join session: ' + (error.message || 'Unknown error'),
        });
    }
}