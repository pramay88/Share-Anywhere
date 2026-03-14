import admin from 'firebase-admin';

// Initialize Firebase Admin (only once per function)
if (!admin.apps.length) {
    const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    if (!serviceAccountKey) {
        throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY environment variable is not set.');
    }
    const credentials = JSON.parse(Buffer.from(serviceAccountKey, 'base64').toString());
    admin.initializeApp({
        credential: admin.credential.cert(credentials),
    });
}

const db = admin.firestore();

export default async function handler(req, res) {
    if (req.method !== 'DELETE') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    try {
        const { code } = req.query;
        const upperCode = code.toUpperCase();

        const docRef = db.collection('p2p_sessions').doc(upperCode);
        const doc = await docRef.get();

        if (doc.exists) {
            await docRef.delete();
            console.log(`🧹 P2P session cleaned up: ${upperCode}`);
        }

        res.json({
            success: true,
        });
    } catch (error) {
        console.error('Error deleting P2P session:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to delete session',
        });
    }
}