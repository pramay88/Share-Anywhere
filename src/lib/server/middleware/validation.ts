import { z } from 'zod';
import {
    MIN_CODE_LENGTH,
    MAX_CODE_LENGTH,
    MAX_FILE_SIZE,
    MAX_FILES_COUNT,
    MAX_TEXT_SIZE,
    MAX_EXPIRY_HOURS,
} from '@/lib/shared/types';
import { ALLOWED_FILE_TYPES } from '@/lib/shared/constants';

// ============= Validation Schemas =============

export const createShareSchema = z.object({
    contentType: z.enum(['file', 'text', 'url']),
    customCode: z
        .string()
        .min(MIN_CODE_LENGTH)
        .max(MAX_CODE_LENGTH)
        .regex(/^[A-Z0-9]+$/, 'Code must contain only uppercase letters and numbers')
        .optional(),
    expiresInHours: z
        .number()
        .min(1)
        .max(MAX_EXPIRY_HOURS)
        .optional(),
    content: z.string().max(MAX_TEXT_SIZE).optional(),
    metadata: z
        .object({
            language: z.string().optional(),
            characterCount: z.number().optional(),
        })
        .optional(),
});

export const shareCodeSchema = z
    .string()
    .min(MIN_CODE_LENGTH)
    .max(MAX_CODE_LENGTH)
    .regex(/^[A-Z0-9]+$/, 'Invalid share code format');

export const consumeShareSchema = z.object({
    fileId: z.string().optional(),
});

export const generateQRSchema = z.object({
    data: z.string().min(1).max(2048),
    size: z.number().min(64).max(1024).optional(),
    format: z.enum(['svg', 'png']).optional(),
});

// ============= Validation Functions =============

/**
 * Validate file size
 */
export function validateFileSize(size: number): { valid: boolean; error?: string } {
    if (size > MAX_FILE_SIZE) {
        return {
            valid: false,
            error: `File size exceeds ${MAX_FILE_SIZE / (1024 * 1024)}MB limit`,
        };
    }
    return { valid: true };
}

/**
 * Validate file type
 */
export function validateFileType(mimeType: string): { valid: boolean; error?: string } {
    if (!ALLOWED_FILE_TYPES.includes(mimeType as any)) {
        return {
            valid: false,
            error: `File type ${mimeType} is not allowed`,
        };
    }
    return { valid: true };
}

/**
 * Validate multiple files
 */
export function validateFiles(files: File[]): { valid: boolean; error?: string } {
    if (files.length > MAX_FILES_COUNT) {
        return {
            valid: false,
            error: `Maximum ${MAX_FILES_COUNT} files allowed`,
        };
    }

    for (const file of files) {
        const sizeValidation = validateFileSize(file.size);
        if (!sizeValidation.valid) {
            return sizeValidation;
        }

        const typeValidation = validateFileType(file.type);
        if (!typeValidation.valid) {
            return typeValidation;
        }
    }

    return { valid: true };
}

/**
 * Validate text content
 */
export function validateTextContent(text: string): { valid: boolean; error?: string } {
    if (!text || text.trim().length === 0) {
        return {
            valid: false,
            error: 'Text content cannot be empty',
        };
    }

    const sizeInBytes = new Blob([text]).size;
    if (sizeInBytes > MAX_TEXT_SIZE) {
        return {
            valid: false,
            error: `Text content exceeds ${MAX_TEXT_SIZE / (1024 * 1024)}MB limit`,
        };
    }

    return { valid: true };
}

/**
 * Sanitize text content (prevent XSS)
 */
export function sanitizeText(text: string): string {
    // Basic sanitization - remove potentially dangerous characters
    return text
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
        .replace(/on\w+\s*=\s*["'][^"']*["']/gi, '');
}

/**
 * Validate and sanitize share code
 */
export function validateAndSanitizeCode(code: string): {
    valid: boolean;
    code?: string;
    error?: string;
} {
    const trimmed = code.trim().toUpperCase();

    try {
        shareCodeSchema.parse(trimmed);
        return { valid: true, code: trimmed };
    } catch (error) {
        return {
            valid: false,
            error: 'Invalid share code format. Must be 6-20 alphanumeric characters.',
        };
    }
}

/**
 * Validate request body against schema
 */
export function validateRequest<T>(
    schema: z.ZodSchema<T>,
    data: unknown
): { valid: boolean; data?: T; error?: string } {
    try {
        const validated = schema.parse(data);
        return { valid: true, data: validated };
    } catch (error) {
        if (error instanceof z.ZodError) {
            const firstError = error.errors[0];
            return {
                valid: false,
                error: `${firstError.path.join('.')}: ${firstError.message}`,
            };
        }
        return {
            valid: false,
            error: 'Invalid request data',
        };
    }
}
