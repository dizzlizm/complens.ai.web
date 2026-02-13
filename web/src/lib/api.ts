import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { fetchAuthSession } from 'aws-amplify/auth';

const API_URL = import.meta.env.VITE_API_URL || '';

export const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,  // Required for CORS with credentials
});

// Add auth token to requests
api.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    // Skip auth for public endpoints
    const isPublicEndpoint = config.url?.startsWith('/public/');
    if (isPublicEndpoint) {
      return config;
    }

    try {
      const session = await fetchAuthSession();
      const token = session.tokens?.idToken?.toString();
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      } else {
        // SECURITY: No token available for authenticated endpoint
        // Reject the request rather than sending without auth
        console.error('No auth token available for authenticated request');
        return Promise.reject(new Error('Authentication required'));
      }
    } catch (error) {
      // SECURITY: Token fetch failed - reject request to prevent
      // unauthenticated requests to protected endpoints
      console.error('Failed to get auth token:', error);
      return Promise.reject(error);
    }
    return config;
  },
  (error: AxiosError) => {
    return Promise.reject(error);
  }
);

// Handle auth errors
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    if (error.response?.status === 401) {
      // Token expired or invalid - redirect to login
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

/**
 * Extract a user-facing error message from an API error response.
 * Replaces unsafe `(err as any)?.response?.data?.error` casts.
 */
export function getApiErrorMessage(error: unknown, fallback: string = 'An error occurred'): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data;
    if (typeof data === 'object' && data !== null) {
      return (data as Record<string, unknown>).error as string
        || (data as Record<string, unknown>).message as string
        || fallback;
    }
  }
  if (error instanceof Error) {
    return error.message;
  }
  return fallback;
}

export default api;
