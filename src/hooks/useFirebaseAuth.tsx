import { useState, useEffect } from 'react';
import { User } from 'firebase/auth';
import { onAuthChange, signOut as firebaseSignOut, getCurrentUser } from '@/integrations/firebase/auth';
import { toast } from 'sonner';
import { logError, getUserFriendlyErrorMessage } from '@/lib/errorHandling';

export const useFirebaseAuth = () => {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Listen to auth state changes
        const unsubscribe = onAuthChange((user) => {
            try {
                setUser(user);
                setLoading(false);
            } catch (error) {
                logError(error, 'onAuthChange');
                setLoading(false);
            }
        });

        // Get current user immediately
        const currentUser = getCurrentUser();
        if (currentUser) {
            setUser(currentUser);
            setLoading(false);
        }

        return () => unsubscribe();
    }, []);

    const signOut = async () => {
        try {
            await firebaseSignOut();
            setUser(null);
            toast.success('Signed out successfully');
        } catch (error: any) {
            logError(error, 'signOut');
            const friendlyMessage = getUserFriendlyErrorMessage(error);
            toast.error(friendlyMessage);
        }
    };

    return { user, loading, signOut };
};
