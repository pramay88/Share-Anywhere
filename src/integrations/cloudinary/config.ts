// Cloudinary Configuration
import { v2 as cloudinary } from 'cloudinary';

// Configure Cloudinary
// Note: For security, we'll use unsigned uploads from the client
// and signed operations from a serverless function if needed

export const cloudinaryConfig = {
    cloudName: import.meta.env.VITE_CLOUDINARY_CLOUD_NAME,
    uploadPreset: import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET || 'sendanywhere_unsigned',
};

// Validate Cloudinary configuration
if (!cloudinaryConfig.cloudName) {
    throw new Error(
        'Missing VITE_CLOUDINARY_CLOUD_NAME environment variable. ' +
        'Please check your .env file and ensure Cloudinary credentials are configured.'
    );
}

/**
 * Upload file to Cloudinary using unsigned upload
 * This is secure because we use upload presets configured in Cloudinary dashboard
 */
export async function uploadToCloudinary(
    file: File,
    folder: string = 'sendanywhere',
    onProgress?: (progress: number) => void
): Promise<{
    url: string;
    publicId: string;
    secureUrl: string;
    resourceType: string;
}> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', cloudinaryConfig.uploadPreset);
    formData.append('folder', folder);

    // Use XMLHttpRequest for progress tracking
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();

        // Track upload progress
        xhr.upload.addEventListener('progress', (e) => {
            if (e.lengthComputable && onProgress) {
                const progress = Math.round((e.loaded / e.total) * 100);
                onProgress(progress);
            }
        });

        xhr.addEventListener('load', () => {
            if (xhr.status === 200) {
                const response = JSON.parse(xhr.responseText);
                resolve({
                    url: response.url,
                    publicId: response.public_id,
                    secureUrl: response.secure_url,
                    resourceType: response.resource_type,
                });
            } else {
                reject(new Error(`Upload failed with status ${xhr.status}`));
            }
        });

        xhr.addEventListener('error', () => {
            reject(new Error('Upload failed due to network error'));
        });

        xhr.addEventListener('abort', () => {
            reject(new Error('Upload was aborted'));
        });

        xhr.open(
            'POST',
            `https://api.cloudinary.com/v1_1/${cloudinaryConfig.cloudName}/auto/upload`
        );
        xhr.send(formData);
    });
}

/**
 * Get download URL for a Cloudinary file
 */
export function getCloudinaryUrl(publicId: string): string {
    return `https://res.cloudinary.com/${cloudinaryConfig.cloudName}/raw/upload/${publicId}`;
}

/**
 * Delete file from Cloudinary (requires backend/serverless function)
 * For now, we'll rely on Cloudinary's auto-deletion policies
 */
export async function deleteFromCloudinary(publicId: string): Promise<void> {
    // This would require a backend endpoint with API credentials
    // For MVP, we can skip deletion or implement it later with a serverless function
    console.warn('Cloudinary deletion not implemented yet. File:', publicId);
}
