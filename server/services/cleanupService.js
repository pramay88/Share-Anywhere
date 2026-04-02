/**
 * Cleanup Service
 * Handles expired share cleanup from Firebase and Cloudinary
 */

import { getFirestore } from '../config/firebase.js';
import { deleteFiles } from './uploadService.js';

/**
 * Find and delete expired shares
 * @returns {Promise<Object>} Cleanup results
 */
export async function cleanupExpiredShares() {
    try {
        const db = getFirestore();
        const now = new Date();

        console.log('🧹 Starting cleanup of expired shares...');

        // Query expired shares (only those not already marked as deleted/cancelled)
        const expiredSnapshot = await db
            .collection('shares')
            .where('expiresAt', '<', now)
            .limit(100) // Process in batches
            .get();

        if (expiredSnapshot.empty) {
            console.log('✅ No expired shares to clean up');
            return { deleted: 0, failed: 0, cloudinaryDeleted: 0, cloudinaryFailed: 0 };
        }

        const sharesToProcess = [];
        const cloudinaryPublicIds = [];

        expiredSnapshot.forEach((doc) => {
            const data = doc.data();
            const status = String(data.status || '').toLowerCase();
            
            // Skip if already deleted/cancelled/expired
            if (['deleted', 'cancelled', 'expired'].includes(status)) {
                return;
            }

            sharesToProcess.push({
                id: doc.id,
                contentType: data.contentType || data.content_type,
                cloudinaryPublicId: data.cloudinaryPublicId,
            });

            // Collect Cloudinary public IDs for file shares
            if (data.cloudinaryPublicId) {
                cloudinaryPublicIds.push(data.cloudinaryPublicId);
            }
        });

        if (sharesToProcess.length === 0) {
            console.log('✅ No shares need cleanup (all already processed)');
            return { deleted: 0, failed: 0, cloudinaryDeleted: 0, cloudinaryFailed: 0 };
        }

        console.log(`📋 Found ${sharesToProcess.length} expired shares to clean up`);

        // Delete files from Cloudinary (non-blocking, best-effort)
        let cloudinaryResults = { successful: 0, failed: 0 };
        if (cloudinaryPublicIds.length > 0) {
            console.log(`🗑️  Deleting ${cloudinaryPublicIds.length} files from Cloudinary...`);
            try {
                cloudinaryResults = await deleteFiles(cloudinaryPublicIds);
            } catch (cloudinaryError) {
                console.error('⚠️  Cloudinary deletion had errors:', cloudinaryError.message);
                // Continue with Firestore updates even if Cloudinary fails
            }
        }

        // Update Firestore (mark as expired, clear Cloudinary references)
        const batch = db.batch();
        sharesToProcess.forEach((share) => {
            const docRef = db.collection('shares').doc(share.id);
            batch.update(docRef, {
                status: 'expired',
                cloudinaryPublicId: null,
                cloudinaryUrl: null,
                deletedAt: now,
                updatedAt: now,
            });
        });

        await batch.commit();

        console.log(`✅ Cleanup complete: ${sharesToProcess.length} shares marked as expired`);

        return {
            deleted: sharesToProcess.length,
            cloudinaryDeleted: cloudinaryResults.successful,
            cloudinaryFailed: cloudinaryResults.failed,
        };
    } catch (error) {
        console.error('❌ Cleanup failed:', error);
        throw error;
    }
}

/**
 * Permanently delete old shares (older than 7 days)
 * @returns {Promise<Object>} Deletion results
 */
export async function permanentlyDeleteOldShares() {
    try {
        const db = getFirestore();
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

        console.log('🗑️  Permanently deleting shares older than 7 days...');

        const oldSnapshot = await db
            .collection('shares')
            .where('deletedAt', '<', sevenDaysAgo)
            .where('status', '==', 'deleted')
            .limit(100)
            .get();

        if (oldSnapshot.empty) {
            console.log('✅ No old shares to permanently delete');
            return { deleted: 0 };
        }

        const batch = db.batch();
        oldSnapshot.forEach((doc) => {
            batch.delete(doc.ref);
        });

        await batch.commit();

        console.log(`✅ Permanently deleted ${oldSnapshot.size} old shares`);

        return { deleted: oldSnapshot.size };
    } catch (error) {
        console.error('❌ Permanent deletion failed:', error);
        throw error;
    }
}

export default {
    cleanupExpiredShares,
    permanentlyDeleteOldShares,
};
