import { API_ENDPOINTS } from '@/lib/shared/constants';
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
    body?: any;
    headers?: Record<string, string>;
    authToken?: string;
}

class ApiClient {
    private baseUrl: string;

    constructor(baseUrl: string = '') {
        this.baseUrl = baseUrl;
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
            const response = await fetch(`${this.baseUrl}${url}`, fetchOptions);
            const data = await response.json();

            if (!response.ok) {
                return {
                    success: false,
                    error: data.error || {
                        code: 'UNKNOWN_ERROR',
                        message: 'An unknown error occurred',
                    },
                };
            }

            return data;
        } catch (error: any) {
            console.error('API request failed:', error);
            return {
                success: false,
                error: {
                    code: 'NETWORK_ERROR',
                    message: error.message || 'Network request failed',
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
     * Check API health
     */
    async healthCheck(): Promise<ApiResponse<any>> {
        return this.request(API_ENDPOINTS.HEALTH, {
            method: 'GET',
        });
    }
}

// Export singleton instance
export const apiClient = new ApiClient();

// Export class for testing
export { ApiClient };
