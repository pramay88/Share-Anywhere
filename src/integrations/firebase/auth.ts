import {
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    signOut as firebaseSignOut,
    onAuthStateChanged,
    User,
    signInAnonymously,
    GoogleAuthProvider,
    signInWithPopup,
} from 'firebase/auth';
import { auth } from './config';

/**
 * Sign in with email and password
 */
export async function signIn(email: string, password: string): Promise<User> {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    return userCredential.user;
}

/**
 * Sign up with email and password
 */
export async function signUp(email: string, password: string): Promise<User> {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    return userCredential.user;
}

/**
 * Sign in with Google OAuth
 */
export async function signInWithGoogle(): Promise<User> {
    try {
        const provider = new GoogleAuthProvider();
        provider.setCustomParameters({
            prompt: 'select_account'
        });
        const result = await signInWithPopup(auth, provider);
        return result.user;
    } catch (error: unknown) {
        console.error('Google sign in error:', error);
        const authError = error as { code?: string };
        // Handle specific errors
        if (authError.code === 'auth/popup-closed-by-user') {
            throw new Error('Sign-in cancelled. Please try again.');
        } else if (authError.code === 'auth/popup-blocked') {
            throw new Error('Pop-up blocked. Please allow pop-ups for this site.');
        } else if (authError.code === 'auth/cancelled-popup-request') {
            throw new Error('Another sign-in is in progress.');
        }
        throw error;
    }
}

/**
 * Sign in anonymously (for guest uploads)
 */
export async function signInAnonymous(): Promise<User> {
    const userCredential = await signInAnonymously(auth);
    return userCredential.user;
}

/**
 * Sign out current user
 */
export async function signOut(): Promise<void> {
    await firebaseSignOut(auth);
}

/**
 * Listen to auth state changes
 */
export function onAuthChange(callback: (user: User | null) => void): () => void {
    return onAuthStateChanged(auth, callback);
}

/**
 * Get current user
 */
export function getCurrentUser(): User | null {
    return auth.currentUser;
}
