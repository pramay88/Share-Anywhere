import admin from 'firebase-admin';

if (!admin.apps.length) {
    const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    if (!serviceAccountKey) {
        throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY env var is not set.');
    }

    const credentials = JSON.parse(Buffer.from(serviceAccountKey, 'base64').toString());
    admin.initializeApp({ credential: admin.credential.cert(credentials) });
}

export const db = admin.firestore();
export { admin };
