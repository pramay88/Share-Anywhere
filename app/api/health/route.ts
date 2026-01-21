import { NextRequest, NextResponse } from 'next/server';
import { getFirestore, getStorage } from '@/lib/server/firebase/admin';
import { APP_CONFIG } from '@/lib/shared/constants';

export async function GET(req: NextRequest) {
    const startTime = Date.now();

    const services = {
        firestore: { status: 'ok' as 'ok' | 'error', latency: 0 },
        storage: { status: 'ok' as 'ok' | 'error', latency: 0 },
    };

    // Check Firestore
    try {
        const firestoreStart = Date.now();
        const db = getFirestore();
        await db.collection('_health_check').limit(1).get();
        services.firestore.latency = Date.now() - firestoreStart;
    } catch (error) {
        services.firestore.status = 'error';
    }

    // Check Storage
    try {
        const storageStart = Date.now();
        const storage = getStorage();
        await storage.bucket().exists();
        services.storage.latency = Date.now() - storageStart;
    } catch (error) {
        services.storage.status = 'error';
    }

    const overallStatus =
        services.firestore.status === 'error' || services.storage.status === 'error'
            ? 'error'
            : 'ok';

    return NextResponse.json({
        status: overallStatus,
        timestamp: new Date().toISOString(),
        services,
        version: APP_CONFIG.APP_VERSION,
    });
}
