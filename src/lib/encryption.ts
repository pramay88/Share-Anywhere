import CryptoJS from 'crypto-js';
import pako from 'pako';

/**
 * Encrypt file data using AES encryption
 */
export async function encryptFile(
    file: File,
    password: string
): Promise<{ encryptedData: string; originalName: string; originalType: string }> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = (e) => {
            try {
                const arrayBuffer = e.target?.result as ArrayBuffer;
                const wordArray = CryptoJS.lib.WordArray.create(arrayBuffer);

                // Encrypt using AES
                const encrypted = CryptoJS.AES.encrypt(wordArray, password).toString();

                resolve({
                    encryptedData: encrypted,
                    originalName: file.name,
                    originalType: file.type,
                });
            } catch (error) {
                reject(error);
            }
        };

        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsArrayBuffer(file);
    });
}

/**
 * Decrypt file data
 */
export function decryptFile(
    encryptedData: string,
    password: string
): Uint8Array {
    try {
        const decrypted = CryptoJS.AES.decrypt(encryptedData, password);
        return convertWordArrayToUint8Array(decrypted);
    } catch (error) {
        throw new Error('Decryption failed. Invalid password or corrupted data.');
    }
}

/**
 * Convert CryptoJS WordArray to Uint8Array
 */
function convertWordArrayToUint8Array(wordArray: CryptoJS.lib.WordArray): Uint8Array {
    const words = wordArray.words;
    const sigBytes = wordArray.sigBytes;
    const u8 = new Uint8Array(sigBytes);

    for (let i = 0; i < sigBytes; i++) {
        u8[i] = (words[i >>> 2] >>> (24 - (i % 4) * 8)) & 0xff;
    }

    return u8;
}

/**
 * Compress file data using gzip
 */
export async function compressFile(file: File): Promise<Blob> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = (e) => {
            try {
                const arrayBuffer = e.target?.result as ArrayBuffer;
                const uint8Array = new Uint8Array(arrayBuffer);

                // Compress using pako (gzip)
                const compressed = pako.gzip(uint8Array);

                const blob = new Blob([compressed], { type: 'application/gzip' });
                resolve(blob);
            } catch (error) {
                reject(error);
            }
        };

        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsArrayBuffer(file);
    });
}

/**
 * Decompress file data
 */
export function decompressFile(compressedData: ArrayBuffer): Uint8Array {
    try {
        const uint8Array = new Uint8Array(compressedData);
        return pako.ungzip(uint8Array);
    } catch (error) {
        throw new Error('Decompression failed. File may be corrupted.');
    }
}

/**
 * Generate a secure random password
 */
export function generateSecurePassword(length: number = 32): string {
    const array = new Uint8Array(length);
    crypto.getRandomValues(array);
    return Array.from(array, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Hash password for storage
 */
export function hashPassword(password: string): string {
    return CryptoJS.SHA256(password).toString();
}

/**
 * Verify password against hash
 */
export function verifyPassword(password: string, hash: string): boolean {
    return hashPassword(password) === hash;
}

/**
 * Calculate file checksum (for integrity verification)
 */
export async function calculateChecksum(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = (e) => {
            try {
                const arrayBuffer = e.target?.result as ArrayBuffer;
                const wordArray = CryptoJS.lib.WordArray.create(arrayBuffer);
                const hash = CryptoJS.SHA256(wordArray).toString();
                resolve(hash);
            } catch (error) {
                reject(error);
            }
        };

        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsArrayBuffer(file);
    });
}
