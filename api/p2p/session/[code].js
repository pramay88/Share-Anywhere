import admin from 'firebase-admin';

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
    res.setHeader('Access-Control-Allow-Methods', 'DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'DELETE') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    try {
        const db = getDb();
        if (!db) {
            return res.status(200).json({ success: true });
        }

        const { code } = req.query;
        const upperCode = code.toUpperCase();

        const docRef = db.collection('p2p_sessions').doc(upperCode);
        const doc = await docRef.get();

        if (doc.exists) {
            await docRef.delete();
            console.log(`🧹 P2P session cleaned up: ${upperCode}`);
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting P2P session:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to delete session',
        });
    }
}