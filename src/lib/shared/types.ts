// Shared TypeScript types for API requests and responses

export type ContentType = 'file' | 'text' | 'url';

// ============= Transfer Types =============

export interface Transfer {
    id: string;
    ownerId: string | null;
    shareCode: string;
    contentType: ContentType;
    textContent?: string;
    textMetadata?: {
        characterCount: number;
        languageHint?: string;
    };
    createdAt: string;
    expiresAt: string | null;
    consumeCount: number;
}

export interface TransferFile {
    id: string;
    transferId: string;
    cloudinaryPublicId: string;
    cloudinaryUrl: string;
    originalName: string;
    fileSize: number;
    mimeType: string;
    createdAt: string;
}

export interface DownloadLog {
    id: string;
    transferId: string;
    fileId: string;
    downloadedBy: string | null;
    downloadedAt: string;
    userAgent: string;
}

// ============= API Request Types =============

export interface CreateShareRequest {
    contentType: ContentType;
    customCode?: string;
    expiresInHours?: number;
    content?: string;
    metadata?: {
        language?: string;
        characterCount?: number;
    };
}

export interface ConsumeShareRequest {
    fileId?: string;
}

export interface GenerateQRRequest {
    data: string;
    size?: number;
    format?: 'svg' | 'png';
}

// ============= API Response Types =============

export interface ApiResponse<T = any> {
    success: boolean;
    data?: T;
    error?: ApiError;
}

export interface ApiError {
    code: string;
    message: string;
    details?: any;
}

export interface CreateShareResponse {
    shareCode: string;
    transferId: string;
    qrCodeUrl: string;
    shareUrl: string;
    expiresAt: string | null;
    createdAt: string;
}

export interface GetShareResponse {
    transfer: Transfer;
    files?: TransferFile[];
}

export interface ConsumeShareResponse {
    downloadUrl?: string;
    textContent?: string;
    consumeCount: number;
}

export interface ValidateCodeResponse {
    isValid: boolean;
    exists: boolean;
    isExpired: boolean;
    isAvailable: boolean;
}

export interface GenerateQRResponse {
    qrCode: string;
    format: 'svg' | 'png';
}

export interface HealthCheckResponse {
    status: 'ok' | 'degraded' | 'error';
    timestamp: string;
    services: {
        firestore: {
            status: 'ok' | 'error';
            latency?: number;
        };
        storage: {
            status: 'ok' | 'error';
            latency?: number;
        };
    };
    version: string;
}

// ============= Error Codes =============

export enum ErrorCode {
    // Validation errors
    INVALID_CONTENT_TYPE = 'INVALID_CONTENT_TYPE',
    INVALID_CUSTOM_CODE = 'INVALID_CUSTOM_CODE',
    INVALID_CODE_FORMAT = 'INVALID_CODE_FORMAT',
    INVALID_FILE_TYPE = 'INVALID_FILE_TYPE',
    FILE_TOO_LARGE = 'FILE_TOO_LARGE',
    TOO_MANY_FILES = 'TOO_MANY_FILES',
    TEXT_TOO_LARGE = 'TEXT_TOO_LARGE',

    // Share errors
    SHARE_NOT_FOUND = 'SHARE_NOT_FOUND',
    SHARE_EXPIRED = 'SHARE_EXPIRED',
    FILE_NOT_FOUND = 'FILE_NOT_FOUND',
    CODE_ALREADY_IN_USE = 'CODE_ALREADY_IN_USE',

    // Upload errors
    UPLOAD_FAILED = 'UPLOAD_FAILED',
    STORAGE_ERROR = 'STORAGE_ERROR',

    // Rate limiting
    RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',

    // Server errors
    INTERNAL_ERROR = 'INTERNAL_ERROR',
    DATABASE_ERROR = 'DATABASE_ERROR',
    AUTHENTICATION_ERROR = 'AUTHENTICATION_ERROR',
}

// ============= Constants =============

export const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB
export const MAX_FILES_COUNT = 10;
export const MAX_TEXT_SIZE = 1 * 1024 * 1024; // 1MB
export const MIN_CODE_LENGTH = 6;
export const MAX_CODE_LENGTH = 20;
export const DEFAULT_EXPIRY_HOURS = 24;
export const MAX_EXPIRY_HOURS = 168; // 7 days
export const SHARE_CODE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
export const SHARE_CODE_LENGTH = 6;
