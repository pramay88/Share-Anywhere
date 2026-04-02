import { db } from '../../_lib/firebase-admin.js';
import { DATA_VERSION, normalizeHistoryRecord, toDate } from '../../_lib/analytics.js';

/**
 * GET /api/user/[userId]/history
 * 
 * Returns user's transfer history from:
 * 1. `shares` collection - Primary source for all internet transfers
 * 2. `transfers` collection - Legacy client-side uploads with file subcollections
 * 3. `history` collection - P2P transfers only (terminal status)
 * 
 * Deduplicates by shareCode to avoid showing same transfer twice.
 * For transfers with multiple files in subcollection, displays "Multiple Files".
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

        const limit = Math.min(Math.max(parseInt(String(req.query.limit || '100'), 10) || 100, 1), 1000);
        const cursor = req.query.cursor ? parseInt(String(req.query.cursor), 10) : null;
        const typeFilter = req.query.type ? String(req.query.type).toLowerCase() : null;
        const statusFilter = req.query.status ? String(req.query.status).toLowerCase() : null;

        // Query all collections in parallel
        const [sharesSnapshotByOwnerId, sharesSnapshotByOwnerSnake, transfersSnapshot, historySnapshot] = await Promise.all([
            // Shares collection with ownerId (camelCase)
            db.collection('shares')
                .where('ownerId', '==', userId)
                .limit(1000)
                .get(),
            // Shares collection with owner_id (snake_case - legacy)
            db.collection('shares')
                .where('owner_id', '==', userId)
                .limit(1000)
                .get(),
            // Transfers collection (legacy client-side uploads)
            db.collection('transfers')
                .where('owner_id', '==', userId)
                .limit(1000)
                .get(),
            // History collection - all transfer types, filter in processing
            db.collection('history')
                .where('version', '==', DATA_VERSION)
                .where('userId', '==', userId)
                .limit(500)
                .get(),
        ]);

        // Process shares collection - this is the primary source for internet transfers
        const sharesDocs = [
            ...sharesSnapshotByOwnerId.docs,
            ...sharesSnapshotByOwnerSnake.docs,
        ];

        const now = Date.now();
        
        const sharesRecords = sharesDocs.map((doc) => {
            const data = doc.data();
            const createdAt = toDate(data.createdAt || data.created_at);
            const expiresAt = toDate(data.expiresAt || data.expires_at);
            
            // Determine status based on expiration and explicit status
            let status = String(data.status || 'ready').toLowerCase();
            
            // Map various status values to our standard set
            if (status === 'ready' || status === 'active' || status === 'pending') {
                // Check if expired by time
                if (expiresAt && expiresAt.getTime() <= now) {
                    status = 'expired';
                } else {
                    status = status === 'pending' ? 'pending' : 'active';
                }
            } else if (status === 'deleted' || status === 'cancelled') {
                status = 'cancelled';
            }
            
            // Determine content type
            const contentType = data.contentType || data.content_type || 'file';
            let fileName = null;
            let fileSize = 0;
            let fileType = null;
            
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

            // AGGRESSIVE FILTERING for shares - filter out suspicious records
            if (status === 'cancelled' && (!fileName || fileName === 'Unknown' || fileSize === 0)) {
                console.log(`🚫 FILTERED suspicious shares record: ${doc.id}, fileName="${fileName}", status="${status}", size=${fileSize}`);
                return null;
            }

            return {
                id: `share_${doc.id}`,
                transferId: doc.id,
                shareCode: data.shareCode || doc.id,
                transferType: 'internet',
                direction: 'send',
                status,
                fileName,
                fileType,
                fileSize,
                totalBytes: fileSize,
                downloadsCount: Number(data.downloadCount || data.downloads_count || 0),
                durationMs: 0, // Internet shares don't track upload duration
                speedBytesPerSec: 0,
                error: null,
                timestamp: createdAt?.toISOString() || new Date().toISOString(),
                expiresAt: expiresAt?.toISOString() || null,
            };
        });

        // Process transfers collection - check for multiple files in subcollection
        const transfersRecords = (await Promise.all(
            transfersSnapshot.docs.map(async (doc) => {
                const data = doc.data();
                const createdAt = toDate(data.created_at || data.createdAt);
                const expiresAt = toDate(data.expires_at || data.expiresAt);
                
                // Determine status
                let status = String(data.status || 'active').toLowerCase();
                if (expiresAt && expiresAt.getTime() <= now) {
                    status = 'expired';
                } else if (data.terminated === true || status === 'cancelled') {
                    status = 'cancelled';
                }
                
                // Skip cancelled transfers entirely - they are just updates to existing shares
                // Cancelled transfers without files are phantom records from incomplete uploads
                if (status === 'cancelled') {
                    console.log(`✓ Skipping cancelled transfer ${doc.id} (handled by shares collection)`);
                    return null;
                }
                
                // Check files subcollection to count files
                const filesSnapshot = await db.collection('transfers').doc(doc.id).collection('files').get();
                const fileCount = filesSnapshot.size;
                
                console.log(`📊 Processing transfer ${doc.id}: status=${status}, content_type=${data.content_type}, fileCount=${fileCount}, shareCode=${data.share_code}`);
                
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
                    // This happens when a transfer doc is created but files never uploaded/cancelled
                    console.log(`⚠️  FILTERING OUT transfer ${doc.id}: no files (status: ${status}, content_type: ${data.content_type})`);
                    return null;
                } else if (fileCount > 1) {
                    // Multiple files - show "Multiple Files"
                    fileName = 'Multiple Files';
                    fileType = 'application/octet-stream';
                    // Sum up all file sizes
                    totalBytes = filesSnapshot.docs.reduce((sum, fileDoc) => {
                        const fileData = fileDoc.data();
                        return sum + Number(fileData.file_size || 0);
                    }, 0);
                    fileSize = totalBytes;
                } else if (fileCount === 1) {
                    // Single file - get file details
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
                    status,
                    fileName: fileName || 'Unknown',
                    fileType,
                    fileSize,
                    totalBytes,
                    downloadsCount: Number(data.consume_count || 0),
                    durationMs: 0,
                    speedBytesPerSec: 0,
                    error: null,
                    timestamp: createdAt?.toISOString() || new Date().toISOString(),
                    expiresAt: expiresAt?.toISOString() || null,
                };
            })
        )).filter(Boolean); // Filter out null values (phantom transfers)

        // Process history collection - AGGRESSIVELY filter suspicious records
        const historyRecords = historySnapshot.docs
            .map((doc) => {
                const record = normalizeHistoryRecord(doc.data(), doc.id);
                
                // AGGRESSIVE FILTERING - if ANY of these conditions are met, filter it out:
                // 1. Cancelled status (duplicate phantom records)
                // 2. No fileName or fileName is null/undefined
                // 3. Zero file size AND zero total bytes (unless it's P2P which is always valid)
                // 4. fileName is literally "Unknown" or empty string
                
                if (record.transferType === 'p2p') {
                    return record; // P2P transfers are always valid
                }
                
                // Filter out cancelled records
                if (record.status === 'cancelled') {
                    console.log(`🚫 FILTERED cancelled history record: ${doc.id}`);
                    return null;
                }
                
                // Filter out records with no file name
                if (!record.fileName || record.fileName === 'Unknown' || record.fileName.trim() === '') {
                    console.log(`🚫 FILTERED nameless history record: ${doc.id}, fileName="${record.fileName}"`);
                    return null;
                }
                
                // Filter out records with zero size (unless they're text)
                if ((record.fileSize === 0 || !record.fileSize) && (record.totalBytes === 0 || !record.totalBytes)) {
                    console.log(`🚫 FILTERED zero-size history record: ${doc.id}, size=${record.fileSize}, total=${record.totalBytes}`);
                    return null;
                }
                
                return record;
            })
            .filter(Boolean); // Remove null values

        // Merge and deduplicate
        const seenCodes = new Set();
        const allRecords = [];
        
        // Add shares records first (primary source)
        for (const record of sharesRecords) {
            const key = record.shareCode || record.transferId || record.id;
            if (!seenCodes.has(key)) {
                seenCodes.add(key);
                allRecords.push(record);
            }
        }
        
        // Add transfers records (may overlap with shares but different IDs)
        for (const record of transfersRecords) {
            const key = record.shareCode || record.transferId || record.id;
            if (!seenCodes.has(key)) {
                seenCodes.add(key);
                allRecords.push(record);
            }
        }
        
        // Add P2P history records (won't conflict with internet transfers)
        for (const record of historyRecords) {
            const key = record.shareCode || record.transferId || record.id;
            if (!seenCodes.has(key)) {
                seenCodes.add(key);
                allRecords.push(record);
            }
        }

        // Apply filters
        const filteredRecords = allRecords.filter((record) => {
            const ts = new Date(record.timestamp).getTime();
            if (cursor && Number.isFinite(cursor) && ts >= cursor) return false;
            if (typeFilter && record.transferType !== typeFilter) return false;
            if (statusFilter && record.status !== statusFilter) return false;
            return true;
        });

        // Sort by timestamp descending
        filteredRecords.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

        const paginated = filteredRecords.slice(0, limit);
        const last = paginated[paginated.length - 1] || null;

        return res.json({
            success: true,
            version: DATA_VERSION,
            records: paginated,
            pagination: {
                limit,
                hasMore: filteredRecords.length > limit,
                nextCursor: last ? new Date(last.timestamp).getTime() : null,
            },
            count: paginated.length,
        });
    } catch (error) {
        console.error('Error fetching user history:', error);
        return res.status(500).json({ success: false, error: 'Failed to fetch history', message: error.message });
    }
}
