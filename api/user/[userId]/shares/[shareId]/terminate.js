import { db, admin } from '../../../../_lib/firebase-admin.js';
import { v2 as cloudinary } from 'cloudinary';

// Configure Cloudinary
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true,
});

/**
 * Delete file from Cloudinary
 */
async function deleteFromCloudinary(publicId) {
    try {
        const result = await cloudinary.uploader.destroy(publicId, {
            invalidate: true,
        });
        console.log(`✅ Deleted from Cloudinary: ${publicId}`, result);
        return result;
    } catch (error) {
        console.error(`❌ Cloudinary deletion failed for ${publicId}:`, error.message);
        throw error;
    }
}

/**
 * POST /api/user/[userId]/shares/[shareId]/terminate
 * Terminates/expires an active share
 * - Sets expiresAt to current time
 * - Marks as expired/terminated
 * - Deletes files from Cloudinary
 * - Keeps history record but makes it unavailable for download
 */
export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    try {
        const { userId, shareId } = req.query;
        
        if (!userId || typeof userId !== 'string') {
            return res.status(400).json({ success: false, error: 'User ID is required' });
        }
        
        if (!shareId || typeof shareId !== 'string') {
            return res.status(400).json({ success: false, error: 'Share ID is required' });
        }

        const now = new Date();
        let updateResult = null;

        // Case 1: If shareId starts with "transfer_", it's from transfers collection
        if (shareId.startsWith('transfer_')) {
            const transferId = shareId.replace('transfer_', '');
            const transferRef = db.collection('transfers').doc(transferId);
            
            try {
                const transferDoc = await transferRef.get();
                
                if (!transferDoc.exists) {
                    return res.status(404).json({ success: false, error: 'Share not found' });
                }

                const transferData = transferDoc.data();
                
                // Verify user owns this transfer
                if (transferData.owner_id !== userId) {
                    return res.status(403).json({ success: false, error: 'Unauthorized' });
                }

                // Get all files in the transfer and delete from Cloudinary
                try {
                    const filesSnapshot = await db.collection('transfers').doc(transferId).collection('files').get();
                    const cloudinaryIds = filesSnapshot.docs
                        .map(doc => doc.data().cloudinary_public_id)
                        .filter(Boolean);
                    
                    if (cloudinaryIds.length > 0) {
                        console.log(`🗑️  Deleting ${cloudinaryIds.length} files from Cloudinary...`);
                        const deleteResults = await Promise.allSettled(
                            cloudinaryIds.map(publicId => deleteFromCloudinary(publicId))
                        );
                        
                        const succeeded = deleteResults.filter(r => r.status === 'fulfilled').length;
                        const failed = deleteResults.filter(r => r.status === 'rejected').length;
                        console.log(`✅ Cloudinary deletion: ${succeeded} succeeded, ${failed} failed`);
                    }
                } catch (cloudinaryError) {
                    console.error(`⚠️  Cloudinary deletion error (non-blocking):`, cloudinaryError.message);
                    // Continue anyway
                }

                // Mark as expired
                await transferRef.update({
                    expires_at: admin.firestore.Timestamp.fromDate(now),
                    status: 'cancelled',
                    terminated: true,
                    updated_at: admin.firestore.Timestamp.fromDate(now),
                });

                updateResult = { type: 'transfer', id: transferId };
            } catch (docError) {
                console.error('Error updating transfer doc:', docError);
                throw docError;
            }
        } else {
            // Case 2: shareId is from shares collection (with or without "share_" prefix)
            let docId = shareId.startsWith('share_') ? shareId.replace('share_', '') : shareId;
            const shareRef = db.collection('shares').doc(docId);
            
            try {
                const shareDoc = await shareRef.get();

                if (!shareDoc.exists) {
                    return res.status(404).json({ success: false, error: 'Share not found' });
                }

                const shareData = shareDoc.data();

                // Verify user owns this share (check both camelCase and snake_case)
                if (shareData.ownerId !== userId && shareData.owner_id !== userId) {
                    return res.status(403).json({ success: false, error: 'Unauthorized' });
                }

                // Delete from Cloudinary if file share
                if (shareData.cloudinaryPublicId) {
                    try {
                        const result = await deleteFromCloudinary(shareData.cloudinaryPublicId);
                        console.log(`✅ Deleted Cloudinary file: ${shareData.cloudinaryPublicId}`, result);
                    } catch (cloudinaryError) {
                        console.error(`⚠️  Cloudinary deletion failed (non-blocking):`, cloudinaryError.message);
                        // Continue anyway - Firestore update is more important
                    }
                }

                // Mark as expired and clear Cloudinary references
                await shareRef.update({
                    expiresAt: admin.firestore.Timestamp.fromDate(now),
                    status: 'cancelled',
                    terminated: true,
                    cloudinaryPublicId: null,
                    cloudinaryUrl: null,
                    updatedAt: admin.firestore.Timestamp.fromDate(now),
                });

                updateResult = { type: 'share', id: docId };
            } catch (docError) {
                console.error('Error updating share doc:', docError);
                throw docError;
            }
        }

        return res.json({
            success: true,
            message: 'Share terminated successfully',
            terminated: updateResult,
        });
    } catch (error) {
        console.error('Error terminating share:', error);
        return res.status(500).json({
            success: false,
            error: 'Failed to terminate share',
            message: error.message,
        });
    }
}
