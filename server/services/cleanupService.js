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

        // Query expired shares
        const expiredSnapshot = await db
            .collection('shares')
            .where('expiresAt', '<', now)
            .where('status', '!=', 'deleted')
            .limit(100) // Process in batches
            .get();

        if (expiredSnapshot.empty) {
            console.log('✅ No expired shares to clean up');
            return { deleted: 0, failed: 0 };
        }

        const sharesToDelete = [];
        const cloudinaryPublicIds = [];

        expiredSnapshot.forEach((doc) => {
            const data = doc.data();
            sharesToDelete.push(doc.id);

            // Collect Cloudinary public IDs for file shares
            if (data.contentType === 'file' && data.cloudinaryPublicId) {
                cloudinaryPublicIds.push(data.cloudinaryPublicId);
            }
        });

        console.log(`📋 Found ${sharesToDelete.length} expired shares`);

        // Delete files from Cloudinary
        let cloudinaryResults = { successful: 0, failed: 0 };
        if (cloudinaryPublicIds.length > 0) {
            console.log(`🗑️  Deleting ${cloudinaryPublicIds.length} files from Cloudinary...`);
            cloudinaryResults = await deleteFiles(cloudinaryPublicIds);
        }

        // Delete from Firestore (mark as deleted, don't actually delete)
        const batch = db.batch();
        sharesToDelete.forEach((shareCode) => {
            const docRef = db.collection('shares').doc(shareCode);
            batch.update(docRef, {
                status: 'deleted',
                deletedAt: new Date(),
            });
        });

        await batch.commit();

        console.log(`✅ Cleanup complete: ${sharesToDelete.length} shares marked as deleted`);

        return {
            deleted: sharesToDelete.length,
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
