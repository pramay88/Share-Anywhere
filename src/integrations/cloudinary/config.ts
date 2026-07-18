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
 * Enhanced with better progress tracking and metadata
 */
export async function uploadToCloudinary(
    file: File | Blob,
    folder: string = 'shareanywhere',
    onProgress?: (progress: number, speed?: number) => void
): Promise<{
    url: string;
    publicId: string;
    secureUrl: string;
    resourceType: string;
    bytes: number;
    format: string;
}> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', cloudinaryConfig.uploadPreset);
    formData.append('folder', folder);

    // Optimize upload settings
    formData.append('quality', 'auto');
    formData.append('fetch_format', 'auto');

    let startTime = Date.now();
    let lastLoaded = 0;

    // Use XMLHttpRequest for progress tracking
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();

        // Track upload progress with speed calculation
        xhr.upload.addEventListener('progress', (e) => {
            if (e.lengthComputable && onProgress) {
                const progress = Math.round((e.loaded / e.total) * 100);

                // Calculate upload speed
                const now = Date.now();
                const timeDiff = (now - startTime) / 1000; // seconds
                const bytesDiff = e.loaded - lastLoaded;
                const speed = timeDiff > 0 ? bytesDiff / timeDiff : 0;

                onProgress(progress, speed);

                lastLoaded = e.loaded;
                startTime = now;
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
                    bytes: response.bytes,
                    format: response.format,
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
 * Note: For downloads, we should use the secure_url stored in Firestore
 * This function is kept for backward compatibility
 */
export function getCloudinaryUrl(publicId: string, resourceType: string = 'raw'): string {
    // If publicId already contains the full URL, return it
    if (publicId.startsWith('http')) {
        return publicId;
    }

    // Otherwise construct the URL based on resource type
    return `https://res.cloudinary.com/${cloudinaryConfig.cloudName}/${resourceType}/upload/${publicId}`;
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
