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

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    try {
        const { peerId } = req.body;

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
            // Check if code exists
            const docRef = db.collection('p2p_sessions').doc(code);
            const doc = await docRef.get();
            if (!doc.exists) break;
        } while (true);

        // Store session
        await db.collection('p2p_sessions').doc(code).set({
            peerId,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            receiverJoined: false,
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
}