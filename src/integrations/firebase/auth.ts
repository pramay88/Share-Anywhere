import {
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    signOut as firebaseSignOut,
    onAuthStateChanged,
    User,
    signInAnonymously,
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
