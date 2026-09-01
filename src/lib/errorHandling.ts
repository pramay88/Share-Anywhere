/**
 * Centralized error handling utilities for SendAnywhere
 */

export interface RetryOptions {
  maxAttempts?: number;
  delayMs?: number;
  backoffMultiplier?: number;
  onRetry?: (attempt: number, error: Error) => void;
}

/**
 * Retry a function with exponential backoff
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxAttempts = 3,
    delayMs = 1000,
    backoffMultiplier = 2,
    onRetry,
  } = options;

  let lastError: Error;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      if (attempt === maxAttempts) {
        break;
      }

      // Check if error is retryable
      if (!isRetryableError(error)) {
        throw error;
      }

      const delay = delayMs * Math.pow(backoffMultiplier, attempt - 1);
      
      if (onRetry) {
        onRetry(attempt, lastError);
      }

      await sleep(delay);
    }
  }

  throw lastError!;
}

interface ErrorLike {
  message?: string;
  code?: string;
  status?: number;
  stack?: string;
}

function toErrorLike(error: unknown): ErrorLike | null {
  if (typeof error === 'object' && error !== null) {
    return error as ErrorLike;
  }
  return null;
}

/**
 * Check if an error is retryable (network errors, timeouts, etc.)
 */
export function isRetryableError(error: unknown): boolean {
  const err = toErrorLike(error);

  // Network errors
  if (err?.message?.includes('fetch') || 
      err?.message?.includes('network') ||
      err?.message?.includes('NetworkError')) {
    return true;
  }

  // Timeout errors
  if (err?.message?.includes('timeout') || 
      err?.message?.includes('timed out')) {
    return true;
  }

  // Supabase specific retryable errors
  if (err?.code === 'PGRST301' || // Connection timeout
      err?.code === '503' ||       // Service unavailable
      err?.code === '429') {       // Too many requests
    return true;
  }

  // HTTP status codes that are retryable
  if (err?.status === 408 || // Request timeout
      err?.status === 429 || // Too many requests
      err?.status === 503 || // Service unavailable
      err?.status === 504) { // Gateway timeout
    return true;
  }

  return false;
}

/**
 * Check if user is offline
 */
export function isOffline(): boolean {
  return !navigator.onLine;
}

/**
 * Get user-friendly error message
 */
export function getUserFriendlyErrorMessage(error: unknown): string {
  // Offline error
  if (isOffline()) {
    return "You appear to be offline. Please check your internet connection and try again.";
  }

  const err = toErrorLike(error);

  // Network errors
  if (err?.message?.includes('fetch') || 
      err?.message?.includes('network') ||
      err?.message?.includes('NetworkError')) {
    return "Network error occurred. Please check your connection and try again.";
  }

  // Timeout errors
  if (err?.message?.includes('timeout') || 
      err?.message?.includes('timed out')) {
    return "Request timed out. Please try again.";
  }

  // Supabase auth errors
  if (err?.message?.includes('Invalid login credentials')) {
    return "Invalid email or password. Please try again.";
  }

  if (err?.message?.includes('Email not confirmed')) {
    return "Please confirm your email address before signing in.";
  }

  // Storage errors
  if (err?.message?.includes('storage')) {
    if (err?.message?.includes('quota')) {
      return "Storage quota exceeded. Please contact support.";
    }
    if (err?.message?.includes('not found')) {
      return "File not found. It may have been deleted or expired.";
    }
    return "Storage error occurred. Please try again.";
  }

  // Database errors
  if (err?.message?.includes('duplicate key')) {
    return "This code is already in use. Please choose a different code.";
  }

  if (err?.message?.includes('violates foreign key constraint')) {
    return "Invalid reference. Please try again.";
  }

  // File size errors
  if (err?.message?.includes('file size') || 
      err?.message?.includes('too large')) {
    return "File is too large. Maximum size is 50MB per file.";
  }

  // Expired transfer
  if (err?.message?.includes('expired')) {
    return "This transfer has expired and is no longer available.";
  }

  // Invalid code
  if (err?.message?.includes('Invalid or expired code')) {
    return "Invalid share code. Please check the code and try again.";
  }

  // Environment variable errors
  if (err?.message?.includes('SUPABASE') || 
      err?.message?.includes('environment')) {
    return "Application configuration error. Please contact support.";
  }

  // Generic error with message
  if (err?.message) {
    return err.message;
  }

  // Fallback
  return "An unexpected error occurred. Please try again.";
}

/**
 * Sleep utility for delays
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Create a promise that times out
 */
export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  timeoutMessage = 'Operation timed out'
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs)
    ),
  ]);
}

/**
 * Log error for debugging (can be extended to send to error tracking service)
 */
export function logError(error: unknown, context?: string): void {
  const timestamp = new Date().toISOString();
  const contextStr = context ? `[${context}]` : '';
  const err = toErrorLike(error);
  
  console.error(`${timestamp} ${contextStr} Error:`, {
    message: err?.message,
    code: err?.code,
    status: err?.status,
    stack: err?.stack,
    details: error,
  });
}
