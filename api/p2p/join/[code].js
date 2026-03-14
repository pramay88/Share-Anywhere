import admin from 'firebase-admin';

const SESSION_TTL_MS = 10 * 60 * 1000; // 10 minutes

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
    if (req.method !== 'GET') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    try {
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
        const createdAt = session.createdAt.toDate();
        const now = new Date();

        // Check expiry
        if (now - createdAt > SESSION_TTL_MS) {
            await docRef.delete();
            return res.status(410).json({
                success: false,
                error: 'Session has expired. Ask the sender for a new code.',
            });
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
            error: 'Failed to join session',
        });
    }
}