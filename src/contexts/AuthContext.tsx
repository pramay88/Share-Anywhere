import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import type { User } from 'firebase/auth';

interface AuthContextType {
    user: User | null;
    loading: boolean;
    signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let mounted = true;
        let unsubscribe: (() => void) | undefined;
        let timeoutId: number | undefined;
        let idleId: number | undefined;

        const initAuth = async () => {
            try {
                const { onAuthChange } = await import('@/integrations/firebase/auth');
                unsubscribe = onAuthChange((nextUser) => {
                    if (!mounted) return;
                    setUser(nextUser);
                    setLoading(false);
                });
            } catch (error) {
                console.error('Failed to initialize auth listener:', error);
                if (mounted) {
                    setLoading(false);
                }
            }
        };

        if ('requestIdleCallback' in window) {
            idleId = (window as Window & {
                requestIdleCallback: (cb: IdleRequestCallback, options?: IdleRequestOptions) => number;
            }).requestIdleCallback(() => {
                void initAuth();
            }, { timeout: 1200 });
        } else {
            timeoutId = window.setTimeout(() => {
                void initAuth();
            }, 300);
        }

        return () => {
            mounted = false;

            if (unsubscribe) {
                unsubscribe();
            }

            if (typeof timeoutId === 'number') {
                window.clearTimeout(timeoutId);
            }

            if (typeof idleId === 'number' && 'cancelIdleCallback' in window) {
                (window as Window & { cancelIdleCallback: (id: number) => void }).cancelIdleCallback(idleId);
            }
        };
    }, []);

    const signOut = async () => {
        try {
            const { signOut: firebaseSignOut } = await import('@/integrations/firebase/auth');
            await firebaseSignOut();
            setUser(null);
        } catch (error) {
            console.error('Sign out error:', error);
            throw error;
        }
    };

    const value = {
        user,
        loading,
        signOut,
    };

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}
