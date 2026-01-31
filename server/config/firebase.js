/**
 * Firebase Admin SDK Configuration
 * Initializes Firebase Admin for server-side operations
 */

import admin from 'firebase-admin';

let firebaseApp = null;

/**
 * Initialize Firebase Admin SDK
 */
function initializeFirebaseAdmin() {
    if (firebaseApp) {
        return firebaseApp;
    }

    try {
        const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;

        if (!serviceAccountKey) {
            throw new Error(
                'FIREBASE_SERVICE_ACCOUNT_KEY environment variable is not set. ' +
                'Please add it to your .env.local file.'
            );
        }

        // Decode base64 service account key
        let credentials;
        try {
            const decodedKey = Buffer.from(serviceAccountKey, 'base64').toString('utf-8');
            credentials = JSON.parse(decodedKey);
        } catch (parseError) {
            throw new Error(
                'Failed to parse FIREBASE_SERVICE_ACCOUNT_KEY. ' +
                'Ensure it is a valid base64-encoded JSON string.'
            );
        }

        // Initialize Firebase Admin
        firebaseApp = admin.initializeApp({
            credential: admin.credential.cert(credentials),
        });

        console.log('✅ Firebase Admin initialized successfully');
        return firebaseApp;
    } catch (error) {
        console.error('❌ Firebase Admin initialization failed:', error.message);
        throw error;
    }
}

/**
 * Get Firestore instance
 */
function getFirestore() {
    if (!firebaseApp) {
        initializeFirebaseAdmin();
    }
    return admin.firestore();
}

/**
 * Get Firebase Admin instance
 */
function getAdmin() {
    if (!firebaseApp) {
        initializeFirebaseAdmin();
    }
    return admin;
}

export {
    initializeFirebaseAdmin,
    getFirestore,
    getAdmin,
};
