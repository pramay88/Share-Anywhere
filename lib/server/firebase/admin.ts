import * as admin from 'firebase-admin';

// Initialize Firebase Admin SDK
// This uses a singleton pattern to prevent multiple initializations

let app: admin.app.App;

export function getFirebaseAdmin(): admin.app.App {
    if (app) {
        return app;
    }

    // Check if running in server environment
    if (typeof window !== 'undefined') {
        throw new Error('Firebase Admin SDK can only be used on the server side');
    }

    try {
        // Try to get existing app
        app = admin.app();
        return app;
    } catch (error) {
        // App doesn't exist, initialize it
        const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;

        if (!serviceAccount) {
            throw new Error(
                'FIREBASE_SERVICE_ACCOUNT_KEY environment variable is not set. ' +
                'Please add your Firebase service account JSON as a base64-encoded string.'
            );
        }

        let credentials;
        try {
            // Decode base64 service account key
            const decodedKey = Buffer.from(serviceAccount, 'base64').toString('utf-8');
            credentials = JSON.parse(decodedKey);
        } catch (parseError) {
            throw new Error(
                'Failed to parse FIREBASE_SERVICE_ACCOUNT_KEY. ' +
                'Ensure it is a valid base64-encoded JSON string.'
            );
        }

        app = admin.initializeApp({
            credential: admin.credential.cert(credentials),
            storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
        });

        console.log('✅ Firebase Admin SDK initialized successfully');
        return app;
    }
}

// Export Firestore instance
export function getFirestore(): admin.firestore.Firestore {
    const app = getFirebaseAdmin();
    return app.firestore();
}

// Export Storage instance
export function getStorage(): admin.storage.Storage {
    const app = getFirebaseAdmin();
    return app.storage();
}

// Export Auth instance
export function getAuth(): admin.auth.Auth {
    const app = getFirebaseAdmin();
    return app.auth();
}

// Utility to verify Firebase ID tokens
export async function verifyIdToken(token: string): Promise<admin.auth.DecodedIdToken> {
    const auth = getAuth();
    try {
        return await auth.verifyIdToken(token);
    } catch (error) {
        throw new Error('Invalid or expired authentication token');
    }
}
