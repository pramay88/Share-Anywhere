import {
    collection,
    doc,
    setDoc,
    getDoc,
    getDocs,
    query,
    where,
    Timestamp,
    addDoc,
    serverTimestamp,
} from 'firebase/firestore';
import { db } from './config';

export interface Transfer {
    id: string;
    owner_id: string | null;
    share_code: string;
    content_type: 'files' | 'text'; // Type of content being shared
    text_content?: string; // For text transfers
    text_metadata?: {
        character_count: number;
        language_hint?: string;
    };
    created_at: Timestamp;
    expires_at: Timestamp | null;
}

export interface TransferFile {
    id: string;
    transfer_id: string;
    cloudinary_public_id: string;
    cloudinary_url: string;
    original_name: string;
    file_size: number;
    mime_type: string;
    created_at: Timestamp;
}

export interface DownloadLog {
    id: string;
    transfer_id: string;
    file_id: string;
    downloaded_by: string | null;
    downloaded_at: Timestamp;
    user_agent: string;
}

/**
 * Generate a unique share code
 */
export function generateShareCode(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

/**
 * Check if share code is unique
 */
export async function isShareCodeUnique(code: string): Promise<boolean> {
    const transfersRef = collection(db, 'transfers');
    const q = query(transfersRef, where('share_code', '==', code.toUpperCase()));
    const querySnapshot = await getDocs(q);
    return querySnapshot.empty;
}

/**
 * Create a new transfer
 */
export async function createTransfer(
    shareCode: string,
    ownerId: string | null,
    expiresAt: Date | null,
    contentType: 'files' | 'text' = 'files',
    textContent?: string,
    textMetadata?: { character_count: number; language_hint?: string }
): Promise<string> {
    const transfersRef = collection(db, 'transfers');
    const transferData: any = {
        owner_id: ownerId,
        share_code: shareCode.toUpperCase(),
        content_type: contentType,
        created_at: serverTimestamp(),
        expires_at: expiresAt ? Timestamp.fromDate(expiresAt) : null,
    };

    // Add text-specific fields if this is a text transfer
    if (contentType === 'text' && textContent) {
        transferData.text_content = textContent;
        transferData.text_metadata = textMetadata || {
            character_count: textContent.length,
        };
    }

    const docRef = await addDoc(transfersRef, transferData);
    return docRef.id;
}

/**
 * Add file to transfer
 */
export async function addFileToTransfer(
    transferId: string,
    fileData: {
        cloudinary_public_id: string;
        cloudinary_url: string;
        original_name: string;
        file_size: number;
        mime_type: string;
    }
): Promise<string> {
    const filesRef = collection(db, 'transfers', transferId, 'files');
    const fileDoc = {
        ...fileData,
        transfer_id: transferId,
        created_at: serverTimestamp(),
    };

    const docRef = await addDoc(filesRef, fileDoc);
    return docRef.id;
}

/**
 * Get transfer by share code
 */
export async function getTransferByCode(code: string): Promise<{
    transfer: Transfer;
    files: TransferFile[];
} | null> {
    const transfersRef = collection(db, 'transfers');
    const q = query(transfersRef, where('share_code', '==', code.toUpperCase()));
    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) {
        return null;
    }

    const transferDoc = querySnapshot.docs[0];
    const transfer = {
        id: transferDoc.id,
        ...transferDoc.data(),
    } as Transfer;

    // Check if expired
    if (transfer.expires_at && transfer.expires_at.toDate() < new Date()) {
        throw new Error('This transfer has expired and is no longer available.');
    }

    // Get files
    const filesRef = collection(db, 'transfers', transfer.id, 'files');
    const filesSnapshot = await getDocs(filesRef);
    const files = filesSnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
    })) as TransferFile[];

    return { transfer, files };
}

/**
 * Log a download
 */
export async function logDownload(
    transferId: string,
    fileId: string,
    downloadedBy: string | null,
    userAgent: string
): Promise<void> {
    const logsRef = collection(db, 'download_logs');
    await addDoc(logsRef, {
        transfer_id: transferId,
        file_id: fileId,
        downloaded_by: downloadedBy,
        downloaded_at: serverTimestamp(),
        user_agent: userAgent,
    });
}
