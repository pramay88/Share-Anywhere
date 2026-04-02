import { db } from '../../_lib/firebase-admin.js';
import { DATA_VERSION, toDate } from '../../_lib/analytics.js';

const ACTIVE_SHARE_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * GET /api/user/[userId]/active-shares
 * 
 * Returns currently active (downloadable) shares for a user.
 * Queries both `shares` AND `transfers` collections to catch all active transfers.
 * 
 * A share is considered "active" if:
 * 1. Status is 'ready', 'pending', or 'active'
 * 2. Not expired (expiresAt > now)
 * 3. Not a consumed ephemeral share
 * 4. Not terminated
 */
export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    try {
        const { userId } = req.query;
        if (!userId || typeof userId !== 'string') {
            return res.status(400).json({ success: false, error: 'User ID is required' });
        }

        const now = Date.now();

        // Query both shares and transfers collections
        const [sharesSnapshotByOwnerId, sharesSnapshotByOwnerSnake, transfersSnapshot] = await Promise.all([
            db.collection('shares')
                .where('ownerId', '==', userId)
                .limit(500)
                .get(),
            db.collection('shares')
                .where('owner_id', '==', userId)
                .limit(500)
                .get(),
            db.collection('transfers')
                .where('owner_id', '==', userId)
                .limit(500)
                .get(),
        ]);

        // Process shares collection
        const seenIds = new Set();
        const sharesDocs = [];
        
        for (const doc of [...sharesSnapshotByOwnerId.docs, ...sharesSnapshotByOwnerSnake.docs]) {
            if (!seenIds.has(doc.id)) {
                seenIds.add(doc.id);
                sharesDocs.push(doc);
            }
        }

        const sharesActive = sharesDocs
            .map((doc) => {
                const data = doc.data();
                const status = String(data.status || '').toLowerCase();
                
                // Only include downloadable shares
                if (!['ready', 'pending', 'active'].includes(status)) {
                    return null;
                }

                // Check expiration
                const expiresAt = toDate(data.expiresAt || data.expires_at);
                if (expiresAt && expiresAt.getTime() <= now) {
                    return null;
                }

                // Skip terminated
                if (data.terminated === true) {
                    return null;
                }

                // Check ephemeral + consumed
                const isEphemeral = data.is_ephemeral === true || data.isEphemeral === true;
                const downloads = Number(data.downloadCount || data.downloads_count || 0);
                if (isEphemeral && downloads > 0) {
                    return null;
                }

                // Determine content type and extract file metadata
                const contentType = data.contentType || data.type || 'file';
                let fileName, fileSize, fileType;

                if (contentType === 'text') {
                    fileName = 'Text content';
                    fileType = 'text/plain';
                    fileSize = data.content ? Buffer.byteLength(data.content, 'utf8') : 0;
                } else if (contentType === 'url') {
                    fileName = data.title || 'URL link';
                    fileType = null;
                    fileSize = 0;
                } else {
                    // File content
                    fileName = data.fileName || data.shareCode || doc.id || 'Unknown';
                    fileSize = Number(data.fileSize || 0);
                    fileType = data.mimeType || 'application/octet-stream';
                }

                const shareCode = data.shareCode || doc.id;
                const createdAt = toDate(data.createdAt || data.created_at);

                return {
                    id: shareCode,
                    transferId: doc.id,
                    shareCode,
                    transferType: 'internet',
                    direction: 'send',
                    status: 'active',
                    fileName,
                    fileType,
                    fileSize,
                    totalBytes: fileSize,
                    downloads_count: downloads,
                    is_ephemeral: isEphemeral,
                    timestamp: createdAt?.toISOString() || new Date().toISOString(),
                    expiresAt: expiresAt?.toISOString() || null,
                };
            })
            .filter(Boolean);

        // Process transfers collection - check for multiple files
        const transfersActive = (await Promise.all(
            transfersSnapshot.docs
                .filter((doc) => {
                    const data = doc.data();
                    
                    // Check status
                    const status = String(data.status || 'active').toLowerCase();
                    if (status === 'cancelled' || data.terminated === true) {
                        return false;
                    }
                    
                    // Check expiration
                    const expiresAt = toDate(data.expires_at || data.expiresAt);
                    if (expiresAt && expiresAt.getTime() <= now) {
                        return false;
                    }
                    
                    return true;
                })
                .map(async (doc) => {
                    const data = doc.data();
                    const createdAt = toDate(data.created_at || data.createdAt);
                    const expiresAt = toDate(data.expires_at || data.expiresAt);
                    
                    // Check files subcollection to count files
                    const filesSnapshot = await db.collection('transfers').doc(doc.id).collection('files').get();
                    const fileCount = filesSnapshot.size;
                    
                    let fileName = null;
                    let fileSize = 0;
                    let fileType = null;
                    let totalBytes = 0;
                    
                    if (data.content_type === 'text') {
                        const textContent = String(data.text_content || '');
                        fileName = 'Text content';
                        fileType = 'text/plain';
                        fileSize = textContent ? Buffer.byteLength(textContent, 'utf8') : 0;
                        totalBytes = fileSize;
                    } else if (fileCount === 0) {
                        // No files - this is an incomplete/phantom transfer, skip it
                        console.log(`⚠️  Skipping active transfer ${doc.id} with no files (shareCode: ${data.share_code})`);
                        return null;
                    } else if (fileCount > 1) {
                        // Multiple files
                        fileName = 'Multiple Files';
                        fileType = 'application/octet-stream';
                        totalBytes = filesSnapshot.docs.reduce((sum, fileDoc) => {
                            const fileData = fileDoc.data();
                            return sum + Number(fileData.file_size || 0);
                        }, 0);
                        fileSize = totalBytes;
                    } else if (fileCount === 1) {
                        // Single file
                        const fileData = filesSnapshot.docs[0].data();
                        fileName = fileData.original_name || 'Unknown';
                        fileSize = Number(fileData.file_size || 0);
                        fileType = fileData.mime_type || 'application/octet-stream';
                        totalBytes = fileSize;
                    }
                    
                    return {
                        id: `transfer_${doc.id}`,
                        transferId: doc.id,
                        shareCode: data.share_code || doc.id,
                        transferType: 'internet',
                        direction: 'send',
                        status: 'active',
                        fileName: fileName || 'Unknown',
                        fileType,
                        fileSize,
                        totalBytes,
                        downloads_count: Number(data.consume_count || 0),
                        is_ephemeral: false,
                        timestamp: createdAt?.toISOString() || new Date().toISOString(),
                        expiresAt: expiresAt?.toISOString() || null,
                    };
                })
        )).filter(Boolean); // Filter out null values (phantom transfers)

        // Merge and deduplicate by shareCode
        const allActive = [...sharesActive, ...transfersActive];
        const seenCodes = new Set();
        const activeShares = allActive
            .filter((item) => {
                const key = item.shareCode || item.transferId || item.id;
                if (seenCodes.has(key)) return false;
                seenCodes.add(key);
                return true;
            })
            .sort((a, b) => {
                const at = toDate(a.timestamp)?.getTime() || 0;
                const bt = toDate(b.timestamp)?.getTime() || 0;
                return bt - at;
            });

        return res.json({
            success: true,
            version: DATA_VERSION,
            activeShares,
            count: activeShares.length,
        });
    } catch (error) {
        console.error('Error fetching active shares:', error);
        return res.status(500).json({ success: false, error: 'Failed to fetch active shares', message: error.message });
    }
}
