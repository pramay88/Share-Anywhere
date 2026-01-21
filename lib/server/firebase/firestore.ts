import { getFirestore } from './admin';
import {
    Transfer,
    TransferFile,
    DownloadLog,
    SHARE_CODE_CHARS,
    SHARE_CODE_LENGTH
} from '@/lib/shared/types';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';

const db = getFirestore();

// ============= Share Code Generation =============

/**
 * Generate a unique share code
 */
export function generateShareCode(): string {
    let code = '';
    for (let i = 0; i < SHARE_CODE_LENGTH; i++) {
        code += SHARE_CODE_CHARS.charAt(Math.floor(Math.random() * SHARE_CODE_CHARS.length));
    }
    return code;
}

/**
 * Check if share code is unique
 */
export async function isShareCodeUnique(code: string): Promise<boolean> {
    const transfersRef = db.collection('transfers');
    const snapshot = await transfersRef
        .where('share_code', '==', code.toUpperCase())
        .limit(1)
        .get();

    return snapshot.empty;
}

/**
 * Generate a unique share code with retries
 */
export async function generateUniqueShareCode(maxAttempts = 10): Promise<string> {
    for (let i = 0; i < maxAttempts; i++) {
        const code = generateShareCode();
        const isUnique = await isShareCodeUnique(code);
        if (isUnique) {
            return code;
        }
    }
    throw new Error('Failed to generate unique share code after multiple attempts');
}

// ============= Transfer Operations =============

/**
 * Create a new transfer
 */
export async function createTransfer(params: {
    shareCode: string;
    ownerId: string | null;
    contentType: 'file' | 'text' | 'url';
    expiresAt: Date | null;
    textContent?: string;
    textMetadata?: {
        characterCount: number;
        languageHint?: string;
    };
}): Promise<string> {
    const transferData: any = {
        owner_id: params.ownerId,
        share_code: params.shareCode.toUpperCase(),
        content_type: params.contentType,
        created_at: FieldValue.serverTimestamp(),
        expires_at: params.expiresAt ? Timestamp.fromDate(params.expiresAt) : null,
        consume_count: 0,
    };

    // Add text-specific fields if this is a text transfer
    if (params.contentType === 'text' && params.textContent) {
        transferData.text_content = params.textContent;
        transferData.text_metadata = params.textMetadata || {
            character_count: params.textContent.length,
        };
    }

    const docRef = await db.collection('transfers').add(transferData);
    return docRef.id;
}

/**
 * Add file to transfer
 */
export async function addFileToTransfer(
    transferId: string,
    fileData: {
        cloudinaryPublicId: string;
        cloudinaryUrl: string;
        originalName: string;
        fileSize: number;
        mimeType: string;
    }
): Promise<string> {
    const fileDoc = {
        transfer_id: transferId,
        cloudinary_public_id: fileData.cloudinaryPublicId,
        cloudinary_url: fileData.cloudinaryUrl,
        original_name: fileData.originalName,
        file_size: fileData.fileSize,
        mime_type: fileData.mimeType,
        created_at: FieldValue.serverTimestamp(),
    };

    const docRef = await db
        .collection('transfers')
        .doc(transferId)
        .collection('files')
        .add(fileDoc);

    return docRef.id;
}

/**
 * Get transfer by share code
 */
export async function getTransferByCode(code: string): Promise<{
    transfer: Transfer;
    files: TransferFile[];
} | null> {
    const snapshot = await db
        .collection('transfers')
        .where('share_code', '==', code.toUpperCase())
        .limit(1)
        .get();

    if (snapshot.empty) {
        return null;
    }

    const transferDoc = snapshot.docs[0];
    const transferData = transferDoc.data();

    // Convert Firestore timestamps to ISO strings
    const transfer: Transfer = {
        id: transferDoc.id,
        ownerId: transferData.owner_id,
        shareCode: transferData.share_code,
        contentType: transferData.content_type,
        textContent: transferData.text_content,
        textMetadata: transferData.text_metadata,
        createdAt: transferData.created_at?.toDate().toISOString() || new Date().toISOString(),
        expiresAt: transferData.expires_at?.toDate().toISOString() || null,
        consumeCount: transferData.consume_count || 0,
    };

    // Check if expired
    if (transfer.expiresAt && new Date(transfer.expiresAt) < new Date()) {
        throw new Error('This transfer has expired and is no longer available.');
    }

    // Get files
    const filesSnapshot = await db
        .collection('transfers')
        .doc(transfer.id)
        .collection('files')
        .get();

    const files: TransferFile[] = filesSnapshot.docs.map((doc) => {
        const data = doc.data();
        return {
            id: doc.id,
            transferId: transfer.id,
            cloudinaryPublicId: data.cloudinary_public_id,
            cloudinaryUrl: data.cloudinary_url,
            originalName: data.original_name,
            fileSize: data.file_size,
            mimeType: data.mime_type,
            createdAt: data.created_at?.toDate().toISOString() || new Date().toISOString(),
        };
    });

    return { transfer, files };
}

/**
 * Update consume count for a transfer
 */
export async function incrementConsumeCount(transferId: string): Promise<number> {
    const transferRef = db.collection('transfers').doc(transferId);

    await transferRef.update({
        consume_count: FieldValue.increment(1),
    });

    const doc = await transferRef.get();
    return doc.data()?.consume_count || 0;
}

/**
 * Log a download
 */
export async function logDownload(params: {
    transferId: string;
    fileId: string;
    downloadedBy: string | null;
    userAgent: string;
}): Promise<void> {
    await db.collection('download_logs').add({
        transfer_id: params.transferId,
        file_id: params.fileId,
        downloaded_by: params.downloadedBy,
        downloaded_at: FieldValue.serverTimestamp(),
        user_agent: params.userAgent,
    });
}

/**
 * Delete expired transfers (for cleanup job)
 */
export async function deleteExpiredTransfers(): Promise<number> {
    const now = Timestamp.now();
    const snapshot = await db
        .collection('transfers')
        .where('expires_at', '<=', now)
        .get();

    let deletedCount = 0;
    const batch = db.batch();

    for (const doc of snapshot.docs) {
        // Delete subcollection files
        const filesSnapshot = await doc.ref.collection('files').get();
        filesSnapshot.docs.forEach((fileDoc) => {
            batch.delete(fileDoc.ref);
        });

        // Delete transfer document
        batch.delete(doc.ref);
        deletedCount++;
    }

    await batch.commit();
    return deletedCount;
}
