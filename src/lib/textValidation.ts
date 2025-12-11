/**
 * Text validation utilities for Quick Text Share feature
 */

// Maximum text size: 100KB (approximately 100,000 characters)
export const MAX_TEXT_SIZE = 100 * 1024; // 100KB in bytes

export interface TextValidationResult {
    valid: boolean;
    error?: string;
}

/**
 * Validate text content for sharing
 */
export function validateTextContent(text: string): TextValidationResult {
    // Check if text is empty
    if (!text || text.trim().length === 0) {
        return {
            valid: false,
            error: 'Text cannot be empty',
        };
    }

    // Check text size (in bytes)
    const textSizeBytes = new Blob([text]).size;
    if (textSizeBytes > MAX_TEXT_SIZE) {
        const sizeMB = (textSizeBytes / 1024 / 1024).toFixed(2);
        const maxMB = (MAX_TEXT_SIZE / 1024 / 1024).toFixed(2);
        return {
            valid: false,
            error: `Text is too large (${sizeMB}MB). Maximum size is ${maxMB}MB`,
        };
    }

    return { valid: true };
}

/**
 * Format text size for display
 */
export function formatTextSize(text: string): string {
    const sizeBytes = new Blob([text]).size;

    if (sizeBytes < 1024) {
        return `${sizeBytes} bytes`;
    } else if (sizeBytes < 1024 * 1024) {
        return `${(sizeBytes / 1024).toFixed(2)} KB`;
    } else {
        return `${(sizeBytes / 1024 / 1024).toFixed(2)} MB`;
    }
}

/**
 * Get character and line count
 */
export function getTextStats(text: string): {
    characters: number;
    lines: number;
    words: number;
    sizeBytes: number;
} {
    const sizeBytes = new Blob([text]).size;
    const lines = text.split('\n').length;
    const words = text.trim().split(/\s+/).filter(w => w.length > 0).length;

    return {
        characters: text.length,
        lines,
        words,
        sizeBytes,
    };
}

/**
 * Simple heuristic to detect if text might be code
 */
export function detectLanguageHint(text: string): string | undefined {
    const trimmed = text.trim();

    // Check for common code patterns
    const patterns: { [key: string]: RegExp[] } = {
        javascript: [
            /^(const|let|var|function|class|import|export)\s/m,
            /console\.(log|error|warn)/,
            /=\u003e/,
        ],
        typescript: [
            /^(interface|type|enum)\s/m,
            /:\s*(string|number|boolean|any)/,
        ],
        python: [
            /^(def|class|import|from)\s/m,
            /^if\s+__name__\s*==\s*['"]__main__['"]/m,
        ],
        html: [
            /^\s*\u003c!DOCTYPE/i,
            /\u003c(html|head|body|div|span|p|a|img)/i,
        ],
        css: [
            /\{[^}]*:[^}]*;[^}]*\}/,
            /@(media|keyframes|import)/,
        ],
        json: [
            /^\s*\{[\s\S]*\}\s*$/,
            /^\s*\[[\s\S]*\]\s*$/,
        ],
    };

    // Check each language
    for (const [lang, regexes] of Object.entries(patterns)) {
        if (regexes.some(regex => regex.test(trimmed))) {
            return lang;
        }
    }

    // Check if it looks like a URL
    if (/^https?:\/\//.test(trimmed) || /^www\./i.test(trimmed)) {
        return 'url';
    }

    return undefined;
}
