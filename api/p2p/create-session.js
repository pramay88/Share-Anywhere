// api/p2p/create-session.js
import admin from 'firebase-admin';

const SESSION_TTL_MS = 10 * 60 * 1000; // 10 minutes

// Safely initialize Firebase Admin with detailed error logging
function getDb() {
    try {
        if (admin.apps.length > 0) {
            return admin.firestore();
        }
        
        const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
        if (!serviceAccountKey) {
            throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY is not set');
        }

        let credentials;
        try {
            const decoded = Buffer.from(serviceAccountKey, 'base64').toString('utf-8');
            credentials = JSON.parse(decoded);
        } catch (parseErr) {
            throw new Error(`Failed to parse FIREBASE_SERVICE_ACCOUNT_KEY: ${parseErr.message}`);
        }

        const app = admin.initializeApp({
            credential: admin.credential.cert(credentials),
        });

        return app.firestore();
    } catch (error) {
        console.error('[P2P Create] Firebase init error:', error.message);
        throw error;
    }
}

function generateCode() {
    // Exclude visually ambiguous chars (0/O, 1/I/L) to reduce mis-entry errors
    const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
    return code;
}

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });

    try {
        const db = getDb();
        const { peerId } = req.body;

        // Validate peerId — must be a non-empty string, reasonable length,
        // alphanumeric + underscores only (matches the format we generate in the hook).
        if (!peerId || typeof peerId !== 'string' || peerId.length > 128 || !/^[a-zA-Z0-9_-]+$/.test(peerId)) {
            return res.status(400).json({ success: false, error: 'Invalid peerId' });
        }

        // Generate unique code (retry on collision, cap at 10 attempts)
        let code;
        for (let attempt = 0; attempt < 10; attempt++) {
            const candidate = generateCode();
            const doc = await db.collection('p2p_sessions').doc(candidate).get();
            if (!doc.exists) { code = candidate; break; }
        }

        if (!code) {
            return res.status(500).json({ success: false, error: 'Failed to generate unique code. Try again.' });
        }

        const now = Date.now();
        await db.collection('p2p_sessions').doc(code).set({
            peerId,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            // Write expiresAt explicitly so the join handler can use a simple
            // timestamp comparison instead of computing it from createdAt.
            expiresAt: new Date(now + SESSION_TTL_MS),
            receiverJoined: false,
        });

        console.log(`P2P session created: ${code}`);

        res.json({ success: true, data: { code, expiresIn: SESSION_TTL_MS / 1000 } });
    } catch (error) {
        console.error('[P2P Create] Error:', error.message, error.stack);
        res.status(500).json({ success: false, error: error.message || 'Failed to create session' });
    }
}