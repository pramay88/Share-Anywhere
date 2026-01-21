// Shared constants used across frontend and backend

// API Endpoints
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || '/api';

export const API_ENDPOINTS = {
    SHARES: {
        CREATE: `${API_BASE_URL}/shares/create`,
        GET: (code: string) => `${API_BASE_URL}/shares/${code}`,
        CONSUME: (code: string) => `${API_BASE_URL}/shares/${code}/consume`,
        VALIDATE: (code: string) => `${API_BASE_URL}/shares/validate/${code}`,
    },
    QR: {
        GENERATE: `${API_BASE_URL}/qr/generate`,
    },
    HEALTH: `${API_BASE_URL}/health`,
} as const;

// File Validation
export const ALLOWED_FILE_TYPES = [
    // Images
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/svg+xml',

    // Documents
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
    'text/csv',

    // Archives
    'application/zip',
    'application/x-zip-compressed',
    'application/x-rar-compressed',
    'application/x-7z-compressed',

    // Code
    'text/html',
    'text/css',
    'text/javascript',
    'application/json',
    'application/xml',

    // Video
    'video/mp4',
    'video/mpeg',
    'video/quicktime',
    'video/x-msvideo',
    'video/webm',

    // Audio
    'audio/mpeg',
    'audio/wav',
    'audio/webm',
    'audio/ogg',
] as const;

export const FILE_TYPE_CATEGORIES = {
    IMAGE: ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'],
    DOCUMENT: [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'text/plain',
    ],
    VIDEO: ['video/mp4', 'video/mpeg', 'video/quicktime', 'video/webm'],
    AUDIO: ['audio/mpeg', 'audio/wav', 'audio/webm', 'audio/ogg'],
    ARCHIVE: ['application/zip', 'application/x-zip-compressed', 'application/x-rar-compressed'],
} as const;

// Rate Limiting
export const RATE_LIMITS = {
    CREATE_SHARE: {
        windowMs: 60 * 60 * 1000, // 1 hour
        maxRequests: 10,
    },
    GET_SHARE: {
        windowMs: 60 * 60 * 1000, // 1 hour
        maxRequests: 100,
    },
    CONSUME_SHARE: {
        windowMs: 60 * 60 * 1000, // 1 hour
        maxRequests: 50,
    },
} as const;

// Error Messages
export const ERROR_MESSAGES = {
    INVALID_CONTENT_TYPE: 'Invalid content type. Must be file, text, or url.',
    INVALID_CUSTOM_CODE: 'Custom code must be 6-20 alphanumeric characters.',
    INVALID_CODE_FORMAT: 'Invalid share code format.',
    INVALID_FILE_TYPE: 'File type not allowed.',
    FILE_TOO_LARGE: 'File size exceeds 100MB limit.',
    TOO_MANY_FILES: 'Maximum 10 files allowed per share.',
    TEXT_TOO_LARGE: 'Text content exceeds 1MB limit.',
    SHARE_NOT_FOUND: 'Share not found. Please check the code and try again.',
    SHARE_EXPIRED: 'This share has expired and is no longer available.',
    FILE_NOT_FOUND: 'File not found in this share.',
    CODE_ALREADY_IN_USE: 'This code is already in use. Please choose another.',
    UPLOAD_FAILED: 'File upload failed. Please try again.',
    STORAGE_ERROR: 'Storage service error. Please try again later.',
    RATE_LIMIT_EXCEEDED: 'Too many requests. Please try again later.',
    INTERNAL_ERROR: 'An internal error occurred. Please try again.',
    DATABASE_ERROR: 'Database error. Please try again later.',
    AUTHENTICATION_ERROR: 'Authentication failed. Please sign in again.',
} as const;

// Success Messages
export const SUCCESS_MESSAGES = {
    SHARE_CREATED: 'Share created successfully!',
    FILE_UPLOADED: 'File uploaded successfully!',
    TEXT_SHARED: 'Text shared successfully!',
    SHARE_CONSUMED: 'Download started!',
    CODE_COPIED: 'Code copied to clipboard!',
    LINK_COPIED: 'Link copied to clipboard!',
} as const;

// App Configuration
export const APP_CONFIG = {
    APP_NAME: 'Share Anywhere',
    APP_VERSION: '2.0.0',
    APP_URL: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
    SUPPORT_EMAIL: 'support@shareanywhere.com',
} as const;
