/**
 * Upload Service
 * Handles Cloudinary upload signatures and file management
 */

import cloudinary from '../config/cloudinary.js';
import crypto from 'crypto';

/**
 * Generate signed upload parameters for direct Cloudinary upload
 * @param {string} shareCode - Unique share code
 * @param {string} fileName - Original file name
 * @returns {Object} Upload signature and parameters
 */
export function generateUploadSignature(shareCode, fileName) {
    const timestamp = Math.round(Date.now() / 1000);
    const folder = 'shares';
    const publicId = `${folder}/${shareCode}_${Date.now()}`;

    // Parameters to sign
    const params = {
        timestamp,
        folder,
        public_id: publicId,
        resource_type: 'auto', // Supports images, videos, raw files
    };

    // Generate signature
    const signature = cloudinary.utils.api_sign_request(
        params,
        process.env.CLOUDINARY_API_SECRET
    );

    return {
        signature,
        timestamp,
        apiKey: process.env.CLOUDINARY_API_KEY,
        cloudName: process.env.CLOUDINARY_CLOUD_NAME,
        folder,
        publicId,
        uploadUrl: `https://api.cloudinary.com/v1_1/${process.env.CLOUDINARY_CLOUD_NAME}/auto/upload`,
    };
}

/**
 * Get Cloudinary URL for a file
 * @param {string} publicId - Cloudinary public ID
 * @param {Object} options - Transformation options
 * @returns {string} Cloudinary URL
 */
export function getFileUrl(publicId, options = {}) {
    return cloudinary.url(publicId, {
        secure: true,
        resource_type: 'auto',
        ...options,
    });
}

/**
 * Delete file from Cloudinary
 * @param {string} publicId - Cloudinary public ID
 * @returns {Promise<Object>} Deletion result
 */
export async function deleteFile(publicId) {
    try {
        // Determine resource type from public_id
        const result = await cloudinary.uploader.destroy(publicId, {
            resource_type: 'auto',
            invalidate: true, // Invalidate CDN cache
        });

        console.log(`🗑️  Deleted file from Cloudinary: ${publicId}`);
        return result;
    } catch (error) {
        console.error(`❌ Failed to delete file from Cloudinary: ${publicId}`, error);
        throw error;
    }
}

/**
 * Delete multiple files from Cloudinary
 * @param {string[]} publicIds - Array of Cloudinary public IDs
 * @returns {Promise<Object>} Deletion results
 */
export async function deleteFiles(publicIds) {
    try {
        const results = await Promise.allSettled(
            publicIds.map(publicId => deleteFile(publicId))
        );

        const successful = results.filter(r => r.status === 'fulfilled').length;
        const failed = results.filter(r => r.status === 'rejected').length;

        console.log(`🗑️  Deleted ${successful} files, ${failed} failed`);

        return { successful, failed, results };
    } catch (error) {
        console.error('❌ Batch delete failed:', error);
        throw error;
    }
}

export default {
    generateUploadSignature,
    getFileUrl,
    deleteFile,
    deleteFiles,
};
