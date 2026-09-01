import { API_BASE_URL, API_ENDPOINTS } from '@/lib/shared/constants';
import type {
    ApiResponse,
    CreateShareRequest,
    CreateShareResponse,
    GetShareResponse,
    ConsumeShareRequest,
    ConsumeShareResponse,
    ValidateCodeResponse,
} from '@/lib/shared/types';

/**
 * API Client for Share-Anywhere
 * Centralized HTTP client for all API calls
 */

interface RequestOptions {
    method: 'GET' | 'POST' | 'PUT' | 'DELETE';
    body?: unknown;
    headers?: Record<string, string>;
    authToken?: string;
    silent?: boolean;
}

class ApiClient {
    private baseUrl: string;

    constructor(baseUrl: string = '') {
        this.baseUrl = baseUrl;
    }

    /**
     * Build a request URL while avoiding duplicated "/api" prefixes.
     */
    private buildRequestUrl(url: string): string {
        const normalizedBase = (this.baseUrl || '').replace(/\/+$/, '');
        const normalizedPath = url.startsWith('/') ? url : `/${url}`;

        if (!normalizedBase) {
            return normalizedPath;
        }

        if (normalizedBase.endsWith('/api') && normalizedPath.startsWith('/api/')) {
            return `${normalizedBase}${normalizedPath.slice(4)}`;
        }

        return `${normalizedBase}${normalizedPath}`;
    }

    /**
     * Make HTTP request with error handling and retries
     */
    private async request<T>(
        url: string,
        options: RequestOptions
    ): Promise<ApiResponse<T>> {
        const headers: Record<string, string> = {
            ...options.headers,
        };

        // Add auth token if provided
        if (options.authToken) {
            headers['Authorization'] = `Bearer ${options.authToken}`;
        }

        // Add content type for JSON requests
        if (options.body && !(options.body instanceof FormData)) {
            headers['Content-Type'] = 'application/json';
        }

        const fetchOptions: RequestInit = {
            method: options.method,
            headers,
            body: options.body instanceof FormData
                ? options.body
                : options.body
                    ? JSON.stringify(options.body)
                    : undefined,
        };

        try {
            const response = await fetch(this.buildRequestUrl(url), fetchOptions);

            // Check if response is JSON
            const contentType = response.headers.get('content-type');
            const isJson = contentType?.includes('application/json');

            let data;
            if (isJson) {
                try {
                    data = await response.json();
                } catch (parseError) {
                    if (!options.silent) {
                        console.error('Failed to parse JSON response:', parseError);
                    }
                    return {
                        success: false,
                        error: {
                            code: 'PARSE_ERROR',
                            message: 'Failed to parse server response',
                        },
                    };
                }
            } else {
                // Not JSON - likely HTML error page
                const text = await response.text();
                if (!options.silent) {
                    console.error('Non-JSON response received:', text.substring(0, 200));
                }
                return {
                    success: false,
                    error: {
                        code: 'INVALID_RESPONSE',
                        message: `Server returned ${response.status}: ${response.statusText}. Expected JSON but got ${contentType || 'unknown content type'}`,
                    },
                };
            }

            if (!response.ok) {
                return {
                    success: false,
                    error: data.error || {
                        code: 'UNKNOWN_ERROR',
                        message: data.message || 'An unknown error occurred',
                    },
                };
            }

            return data;
        } catch (error: unknown) {
            if (!options.silent) {
                console.error('API request failed:', error);
            }
            const message = error instanceof Error ? error.message : 'Network request failed';
            return {
                success: false,
                error: {
                    code: 'NETWORK_ERROR',
                    message,
                },
            };
        }
    }

    /**
     * Create a new share (file/text/URL)
     */
    async createShare(
        data: CreateShareRequest,
        files?: File[],
        authToken?: string
    ): Promise<ApiResponse<CreateShareResponse>> {
        const formData = new FormData();

        formData.append('contentType', data.contentType);

        if (data.customCode) {
            formData.append('customCode', data.customCode);
        }

        if (data.expiresInHours) {
            formData.append('expiresInHours', data.expiresInHours.toString());
        }

        if (data.content) {
            formData.append('content', data.content);
        }

        if (data.metadata) {
            formData.append('metadata', JSON.stringify(data.metadata));
        }

        // Add files if provided
        if (files && files.length > 0) {
            files.forEach((file) => {
                formData.append('files', file);
            });
        }

        return this.request<CreateShareResponse>(API_ENDPOINTS.SHARES.CREATE, {
            method: 'POST',
            body: formData,
            authToken,
        });
    }

    /**
     * Get share by code
     */
    async getShare(
        code: string,
        authToken?: string
    ): Promise<ApiResponse<GetShareResponse>> {
        return this.request<GetShareResponse>(API_ENDPOINTS.SHARES.GET(code), {
            method: 'GET',
            authToken,
        });
    }

    /**
     * Consume share (download file or get text)
     */
    async consumeShare(
        code: string,
        data: ConsumeShareRequest,
        authToken?: string
    ): Promise<ApiResponse<ConsumeShareResponse>> {
        return this.request<ConsumeShareResponse>(
            API_ENDPOINTS.SHARES.CONSUME(code),
            {
                method: 'POST',
                body: data,
                authToken,
            }
        );
    }

    /**
     * Validate share code
     */
    async validateCode(
        code: string
    ): Promise<ApiResponse<ValidateCodeResponse>> {
        return this.request<ValidateCodeResponse>(
            API_ENDPOINTS.SHARES.VALIDATE(code),
            {
                method: 'GET',
            }
        );
    }

    /**
     * Get user's share history (last 24 hours)
     */
    async getUserHistory<T = unknown>(userId: string, params?: Record<string, string | number | undefined>): Promise<ApiResponse<T>> {
        const searchParams = new URLSearchParams();
        if (params) {
            Object.entries(params).forEach(([key, value]) => {
                if (value !== undefined && value !== null && value !== '') {
                    searchParams.set(key, String(value));
                }
            });
        }

        const query = searchParams.toString();
        const url = query
            ? `${API_ENDPOINTS.USER.HISTORY(userId)}?${query}`
            : API_ENDPOINTS.USER.HISTORY(userId);

        return this.request<T>(url, {
            method: 'GET',
        });
    }

    /**
     * Get user statistics
     */
    async getUserStats<T = unknown>(userId: string): Promise<ApiResponse<T>> {
        return this.request<T>(API_ENDPOINTS.USER.STATS(userId), {
            method: 'GET',
        });
    }

    /**
     * Get active internet shares for a user
     */
    async getActiveShares<T = unknown>(userId: string): Promise<ApiResponse<T>> {
        return this.request<T>(API_ENDPOINTS.USER.ACTIVE_SHARES(userId), {
            method: 'GET',
        });
    }

    /**
     * Stop/delete an active share
     */
    async stopActiveShare<T = unknown>(userId: string, shareCode: string): Promise<ApiResponse<T>> {
        return this.request<T>(API_ENDPOINTS.USER.STOP_SHARE(userId, shareCode), {
            method: 'DELETE',
        });
    }

    /**
     * Terminate an active share by ID
     */
    async terminateShare<T = unknown>(userId: string, shareId: string): Promise<ApiResponse<T>> {
        return this.request<T>(API_ENDPOINTS.USER.TERMINATE_SHARE(userId, shareId), {
            method: 'POST',
        });
    }

    /**
     * Track transfer analytics/history event
     */
    async trackTransferEvent<T = unknown>(userId: string, event: Record<string, unknown>): Promise<ApiResponse<T>> {
        return this.request<T>(API_ENDPOINTS.USER.TRACK_EVENT(userId), {
            method: 'POST',
            body: event,
            silent: true,
        });
    }

    /**
     * Track transfer event without user identity (guest mode)
     */
    async trackAnonymousTransferEvent<T = unknown>(event: Record<string, unknown>): Promise<ApiResponse<T>> {
        return this.request<T>(API_ENDPOINTS.USER.TRACK_EVENT_ANON, {
            method: 'POST',
            body: event,
            silent: true,
        });
    }

    /**
     * Get global admin analytics summary
     */
    async getAdminAnalyticsSummary<T = unknown>(): Promise<ApiResponse<T>> {
        return this.request<T>(API_ENDPOINTS.USER.ADMIN_ANALYTICS, {
            method: 'GET',
        });
    }

    /**
     * Check API health
     */
    async healthCheck<T = unknown>(): Promise<ApiResponse<T>> {
        return this.request<T>(API_ENDPOINTS.HEALTH, {
            method: 'GET',
        });
    }
}

// Export singleton instance with backend URL
export const apiClient = new ApiClient(API_BASE_URL);

// Export class for testing
export { ApiClient };
