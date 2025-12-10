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

/**
 * Check if an error is retryable (network errors, timeouts, etc.)
 */
export function isRetryableError(error: any): boolean {
  // Network errors
  if (error?.message?.includes('fetch') || 
      error?.message?.includes('network') ||
      error?.message?.includes('NetworkError')) {
    return true;
  }

  // Timeout errors
  if (error?.message?.includes('timeout') || 
      error?.message?.includes('timed out')) {
    return true;
  }

  // Supabase specific retryable errors
  if (error?.code === 'PGRST301' || // Connection timeout
      error?.code === '503' ||       // Service unavailable
      error?.code === '429') {       // Too many requests
    return true;
  }

  // HTTP status codes that are retryable
  if (error?.status === 408 || // Request timeout
      error?.status === 429 || // Too many requests
      error?.status === 503 || // Service unavailable
      error?.status === 504) { // Gateway timeout
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
export function getUserFriendlyErrorMessage(error: any): string {
  // Offline error
  if (isOffline()) {
    return "You appear to be offline. Please check your internet connection and try again.";
  }

  // Network errors
  if (error?.message?.includes('fetch') || 
      error?.message?.includes('network') ||
      error?.message?.includes('NetworkError')) {
    return "Network error occurred. Please check your connection and try again.";
  }

  // Timeout errors
  if (error?.message?.includes('timeout') || 
      error?.message?.includes('timed out')) {
    return "Request timed out. Please try again.";
  }

  // Supabase auth errors
  if (error?.message?.includes('Invalid login credentials')) {
    return "Invalid email or password. Please try again.";
  }

  if (error?.message?.includes('Email not confirmed')) {
    return "Please confirm your email address before signing in.";
  }

  // Storage errors
  if (error?.message?.includes('storage')) {
    if (error?.message?.includes('quota')) {
      return "Storage quota exceeded. Please contact support.";
    }
    if (error?.message?.includes('not found')) {
      return "File not found. It may have been deleted or expired.";
    }
    return "Storage error occurred. Please try again.";
  }

  // Database errors
  if (error?.message?.includes('duplicate key')) {
    return "This code is already in use. Please choose a different code.";
  }

  if (error?.message?.includes('violates foreign key constraint')) {
    return "Invalid reference. Please try again.";
  }

  // File size errors
  if (error?.message?.includes('file size') || 
      error?.message?.includes('too large')) {
    return "File is too large. Maximum size is 50MB per file.";
  }

  // Expired transfer
  if (error?.message?.includes('expired')) {
    return "This transfer has expired and is no longer available.";
  }

  // Invalid code
  if (error?.message?.includes('Invalid or expired code')) {
    return "Invalid share code. Please check the code and try again.";
  }

  // Environment variable errors
  if (error?.message?.includes('SUPABASE') || 
      error?.message?.includes('environment')) {
    return "Application configuration error. Please contact support.";
  }

  // Generic error with message
  if (error?.message) {
    return error.message;
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
export function logError(error: any, context?: string): void {
  const timestamp = new Date().toISOString();
  const contextStr = context ? `[${context}]` : '';
  
  console.error(`${timestamp} ${contextStr} Error:`, {
    message: error?.message,
    code: error?.code,
    status: error?.status,
    stack: error?.stack,
    details: error,
  });
}
