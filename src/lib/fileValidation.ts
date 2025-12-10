/**
 * File validation utilities for SendAnywhere
 */

// Maximum file size: 50MB
export const MAX_FILE_SIZE = 50 * 1024 * 1024;

// Maximum number of files per transfer
export const MAX_FILES_PER_TRANSFER = 20;

// Allowed file types (MIME types and extensions)
export const ALLOWED_FILE_TYPES = {
    // Images
    'image/jpeg': ['.jpg', '.jpeg'],
    'image/png': ['.png'],
    'image/gif': ['.gif'],
    'image/webp': ['.webp'],
    'image/svg+xml': ['.svg'],

    // Documents
    'application/pdf': ['.pdf'],
    'application/msword': ['.doc'],
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
    'application/vnd.ms-excel': ['.xls'],
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
    'application/vnd.ms-powerpoint': ['.ppt'],
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['.pptx'],
    'text/plain': ['.txt'],
    'text/csv': ['.csv'],

    // Archives
    'application/zip': ['.zip'],
    'application/x-rar-compressed': ['.rar'],
    'application/x-7z-compressed': ['.7z'],
    'application/x-tar': ['.tar'],
    'application/gzip': ['.gz'],
};

export interface ValidationResult {
    valid: boolean;
    error?: string;
}

export interface FileValidationResult extends ValidationResult {
    file: File;
}

/**
 * Validate a single file
 */
export function validateFile(file: File): ValidationResult {
    // Check if file exists
    if (!file) {
        return {
            valid: false,
            error: 'No file provided',
        };
    }

    // Check for empty files
    if (file.size === 0) {
        return {
            valid: false,
            error: `"${file.name}" is empty (0 bytes). Please select a valid file.`,
        };
    }

    // Check file size
    if (file.size > MAX_FILE_SIZE) {
        const sizeMB = (file.size / 1024 / 1024).toFixed(2);
        const maxSizeMB = (MAX_FILE_SIZE / 1024 / 1024).toFixed(0);
        return {
            valid: false,
            error: `"${file.name}" is too large (${sizeMB}MB). Maximum file size is ${maxSizeMB}MB.`,
        };
    }

    // Check file type
    const isValidType = isFileTypeAllowed(file);
    if (!isValidType) {
        const fileExt = getFileExtension(file.name);
        return {
            valid: false,
            error: `"${file.name}" has an unsupported file type${fileExt ? ` (${fileExt})` : ''}. Please select a valid file type.`,
        };
    }

    return { valid: true };
}

/**
 * Validate multiple files
 */
export function validateFiles(files: File[]): FileValidationResult[] {
    if (!files || files.length === 0) {
        return [{
            valid: false,
            error: 'No files selected',
            file: null as any,
        }];
    }

    // Check number of files
    if (files.length > MAX_FILES_PER_TRANSFER) {
        return [{
            valid: false,
            error: `Too many files selected. Maximum is ${MAX_FILES_PER_TRANSFER} files per transfer.`,
            file: null as any,
        }];
    }

    // Validate each file
    return files.map(file => ({
        file,
        ...validateFile(file),
    }));
}

/**
 * Get validation summary for multiple files
 */
export function getValidationSummary(results: FileValidationResult[]): ValidationResult {
    const invalidResults = results.filter(r => !r.valid);

    if (invalidResults.length === 0) {
        return { valid: true };
    }

    // Return first error
    return {
        valid: false,
        error: invalidResults[0].error,
    };
}

/**
 * Check if file type is allowed
 */
export function isFileTypeAllowed(file: File): boolean {
    // Check MIME type
    if (file.type && ALLOWED_FILE_TYPES[file.type as keyof typeof ALLOWED_FILE_TYPES]) {
        return true;
    }

    // Check file extension as fallback
    const extension = getFileExtension(file.name);
    if (extension) {
        return Object.values(ALLOWED_FILE_TYPES).some(exts =>
            exts.includes(extension.toLowerCase())
        );
    }

    return false;
}

/**
 * Get file extension from filename
 */
export function getFileExtension(filename: string): string | null {
    const match = filename.match(/\.[^.]+$/);
    return match ? match[0] : null;
}

/**
 * Format file size for display
 */
export function formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

/**
 * Get total size of multiple files
 */
export function getTotalFileSize(files: File[]): number {
    return files.reduce((total, file) => total + file.size, 0);
}

/**
 * Validate custom share code
 */
export function validateShareCode(code: string): ValidationResult {
    if (!code || code.trim().length === 0) {
        return {
            valid: false,
            error: 'Share code cannot be empty',
        };
    }

    if (code.length < 6) {
        return {
            valid: false,
            error: 'Share code must be at least 6 characters long',
        };
    }

    if (code.length > 20) {
        return {
            valid: false,
            error: 'Share code must be at most 20 characters long',
        };
    }

    // Only allow alphanumeric characters
    if (!/^[A-Z0-9]+$/i.test(code)) {
        return {
            valid: false,
            error: 'Share code can only contain letters and numbers',
        };
    }

    return { valid: true };
}
