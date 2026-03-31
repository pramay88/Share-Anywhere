import { db } from '../../_lib/firebase-admin.js';
import { DATA_VERSION, toDate } from '../../_lib/analytics.js';

const ACTIVE_SHARE_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

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
        const twentyFourHoursAgo = now - ACTIVE_SHARE_EXPIRY_MS;

        const [snapshot, transfersSnapshot, sharesSnapshotByOwnerId, sharesSnapshotByOwnerSnake] = await Promise.all([
            db.collection('active_shares')
                .where('userId', '==', userId)
                .limit(500)
                .get(),
            db.collection('transfers')
                .where('owner_id', '==', userId)
                .limit(500)
                .get(),
            db.collection('shares')
                .where('ownerId', '==', userId)
                .limit(500)
                .get(),
            db.collection('shares')
                .where('owner_id', '==', userId)
                .limit(500)
                .get(),
        ]);

        // Process active_shares collection - only include if not expired
        const queueActiveShares = snapshot.docs
            .map((doc) => ({ id: doc.id, ...doc.data() }))
            .filter((row) => {
                // Only include if status is active/pending AND not marked as terminated/expired
                const isActiveStatus = ['active', 'pending'].includes(String(row.status || '').toLowerCase());
                if (!isActiveStatus) return false;

                // P2P is one-time and should never be listed as active.
                if (String(row.transferType || '').toLowerCase() === 'p2p') {
                    return false;
                }

                // Check expiration - if expiresAt is set and in the past, skip it
                const expiresAt = toDate(row.expiresAt);
                if (expiresAt && expiresAt.getTime() <= now) {
                    return false;
                }

                // Check if created within 24 hours
                const startedAt = toDate(row.startedAt);
                if (startedAt && startedAt.getTime() < twentyFourHoursAgo) {
                    return false;
                }

                return true;
            })
            .sort((a, b) => {
                const at = toDate(a.updatedAt || a.startedAt)?.getTime() || 0;
                const bt = toDate(b.updatedAt || b.startedAt)?.getTime() || 0;
                return bt - at;
            })
            .map((row) => ({
                id: row.id,
                transferId: row.transferId || null,
                shareCode: row.shareCode || null,
                transferType: row.transferType || 'internet',
                direction: row.direction || 'send',
                status: 'active',
                fileName: row.file?.name || null,
                fileType: row.file?.type || null,
                fileSize: row.file?.size || 0,
                totalBytes: row.totalBytes || 0,
                downloads_count: row.downloads_count || 0,
                is_ephemeral: row.is_ephemeral === true,
                timestamp: toDate(row.startedAt)?.toISOString() || new Date().toISOString(),
                expiresAt: toDate(row.expiresAt)?.toISOString() || null,
            }));

        // Process transfers collection - only include if not expired and within 24h
        const transferRows = transfersSnapshot.docs
            .map((doc) => ({ id: doc.id, ...doc.data() }))
            .filter((row) => {
                // Check if transfer is still active (has expiration in future)
                const expiresAt = toDate(row.expires_at || row.expiresAt);
                if (expiresAt && expiresAt.getTime() <= now) {
                    return false;
                }

                // Check if created within 24 hours
                const createdAt = toDate(row.created_at || row.createdAt);
                if (createdAt && createdAt.getTime() < twentyFourHoursAgo) {
                    return false;
                }

                return true;
            });

        const transferActiveShares = await Promise.all(transferRows.map(async (row) => {
            let fileName = null;
            let fileType = null;
            let fileSize = 0;

            if (row.content_type === 'text') {
                const textContent = String(row.text_content || row.textContent || '');
                fileName = 'Text content';
                fileType = 'text/plain';
                fileSize = textContent ? Buffer.byteLength(textContent, 'utf8') : Number(row.total_bytes || row.totalBytes || 0);
            } else {
                // Pull real file metadata from transfers/{transferId}/files when available.
                try {
                    const filesSnapshot = await db.collection('transfers').doc(row.id).collection('files').limit(1).get();
                    if (!filesSnapshot.empty) {
                        const file = filesSnapshot.docs[0].data();
                        fileName = file.original_name || file.file_name || null;
                        fileType = file.mime_type || file.file_type || null;
                        fileSize = Number(file.file_size || file.size || 0);
                    }
                } catch {
                    // Keep response resilient even if subcollection read fails.
                }
            }

            const totalBytes = Number(row.total_bytes || row.totalBytes || fileSize || 0);
            return {
                id: `transfer_${row.id}`,
                transferId: row.id,
                shareCode: row.share_code || row.shareCode || row.id || null,
                transferType: 'internet',
                direction: 'send',
                status: 'active',
                fileName: row.file_name || row.fileName || fileName || row.share_code || row.id || 'Unknown',
                fileType: row.file_type || row.fileType || fileType,
                fileSize: Number(row.file_size || row.fileSize || fileSize || 0),
                totalBytes,
                downloads_count: Number(row.consume_count || row.downloads_count || row.downloadCount || 0),
                is_ephemeral: row.is_ephemeral === true,
                timestamp: toDate(row.created_at || row.createdAt)?.toISOString() || new Date().toISOString(),
                expiresAt: toDate(row.expires_at || row.expiresAt)?.toISOString() || null,
            };
        }));

        // Process shares collection - these have the actual file metadata
        const sharesDocs = [
            ...sharesSnapshotByOwnerId.docs,
            ...sharesSnapshotByOwnerSnake.docs,
        ];

        const sharesActive = sharesDocs
            .map((doc) => ({ id: doc.id, ...doc.data() }))
            .filter((row) => {
                const status = String(row.status || '').toLowerCase();
                // Only include downloadable shares
                if (!['ready', 'pending', 'active'].includes(status)) {
                    return false;
                }

                const expiresAt = toDate(row.expiresAt || row.expires_at);
                if (expiresAt && expiresAt.getTime() <= now) {
                    return false;
                }

                // Check if within 24 hours
                const createdAt = toDate(row.createdAt || row.created_at);
                if (createdAt && createdAt.getTime() < twentyFourHoursAgo) {
                    return false;
                }

                // Optional one-time behavior: if ephemeral and already downloaded, treat inactive
                const isEphemeral = row.is_ephemeral === true || row.isEphemeral === true;
                const downloads = Number(row.downloadCount || row.downloads_count || 0);
                if (isEphemeral && downloads > 0) {
                    return false;
                }

                return true;
            })
            .map((row) => {
                // Determine content type and extract proper file metadata
                const contentType = row.contentType || row.type || 'file';
                let fileName, fileSize, fileType;
                const isEphemeral = row.is_ephemeral === true || row.isEphemeral === true;

                if (contentType === 'text') {
                    fileName = 'Text content';
                    fileType = 'text/plain';
                    fileSize = row.content ? Buffer.byteLength(row.content, 'utf8') : 0;
                } else if (contentType === 'url') {
                    fileName = row.title || 'URL link';
                    fileType = null;
                    fileSize = 0;
                } else {
                    // File content
                    fileName = row.fileName || row.shareCode || row.code || row.id || 'Unknown';
                    fileSize = Number(row.fileSize || 0);
                    fileType = row.mimeType || 'application/octet-stream';
                }

                const shareCode = row.shareCode || row.code || row.id;
                return {
                    id: `share_${row.id}`,
                    transferId: row.transferId || row.id,
                    shareCode,
                    transferType: 'internet',
                    direction: 'send',
                    status: 'active',
                    fileName,
                    fileType,
                    fileSize,
                    totalBytes: fileSize,
                    downloads_count: Number(row.downloadCount || row.downloads_count || 0),
                    is_ephemeral: isEphemeral,
                    timestamp: toDate(row.createdAt || row.created_at)?.toISOString() || new Date().toISOString(),
                    expiresAt: toDate(row.expiresAt || row.expires_at)?.toISOString() || null,
                };
            });

        // Prefer shares metadata, then enrich queue/transfers with it.
        const shareByCode = new Map(sharesActive.map((item) => [item.shareCode, item]));
        const shareByTransferId = new Map(sharesActive.map((item) => [item.transferId, item]));

        const enrichFromShares = (item) => {
            const matched = shareByCode.get(item.shareCode) || shareByTransferId.get(item.transferId) || null;
            if (!matched) return item;
            return {
                ...item,
                fileName: item.fileName || matched.fileName,
                fileType: item.fileType || matched.fileType,
                fileSize: Number(item.fileSize || matched.fileSize || 0),
                totalBytes: Number(item.totalBytes || matched.totalBytes || matched.fileSize || 0),
                downloads_count: Number(item.downloads_count || matched.downloads_count || 0),
            };
        };

        const normalizedQueue = queueActiveShares.map(enrichFromShares);
        const normalizedTransfers = transferActiveShares.map(enrichFromShares);
        const allCandidates = [...sharesActive, ...normalizedQueue, ...normalizedTransfers];

        // De-duplicate by shareCode then transferId then id, keeping the first (shares first for richer metadata).
        const seen = new Set();
        const activeShares = allCandidates.filter((item) => {
            const key = item.shareCode || item.transferId || item.id;
            if (!key) return true;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        }).sort((a, b) => {
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
