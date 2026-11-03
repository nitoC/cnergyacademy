import axios, { AxiosError, type AxiosRequestConfig } from 'axios';

/**
 * Single API client for the browser. Requests go to /api/v1 on the web
 * origin (rewritten to the NestJS API), carry httpOnly session cookies and
 * the CSRF header. A 401 triggers one shared refresh attempt and a retry.
 */
export const api = axios.create({
  baseURL: '/api/v1',
  withCredentials: true,
  headers: { 'x-academy-csrf': '1' },
  timeout: 20_000,
});

export interface ApiErrorBody {
  statusCode: number;
  code: string;
  message: string;
  details?: unknown;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

let refreshing: Promise<void> | null = null;

function refreshOnce() {
  refreshing ??= api
    .post('/auth/refresh', undefined, { _skipRefresh: true } as AxiosRequestConfig)
    .then(() => undefined)
    .finally(() => {
      setTimeout(() => (refreshing = null), 0);
    });
  return refreshing;
}

api.interceptors.response.use(
  (r) => r,
  async (error: AxiosError<ApiErrorBody>) => {
    const config = error.config as (AxiosRequestConfig & { _retried?: boolean; _skipRefresh?: boolean }) | undefined;
    const status = error.response?.status;
    const code = error.response?.data?.code;
    if (status === 401 && config && !config._retried && !config._skipRefresh && code !== 'INVALID_CREDENTIALS') {
      config._retried = true;
      try {
        await refreshOnce();
        return api(config);
      } catch {
        /* fall through to the original error */
      }
    }
    const body = error.response?.data;
    if (body && typeof body === 'object' && 'code' in body) {
      return Promise.reject(new ApiError(body.statusCode, body.code, body.message, body.details));
    }
    if (error.code === 'ECONNABORTED') return Promise.reject(new ApiError(0, 'TIMEOUT', 'The request took too long. Check your connection and try again.'));
    return Promise.reject(new ApiError(status ?? 0, 'NETWORK_ERROR', 'Could not reach the server. Check your connection and try again.'));
  },
);

export function errorMessage(err: unknown, fallback = 'Something went wrong'): string {
  if (err instanceof ApiError) {
    if (err.code === 'VALIDATION_FAILED' && Array.isArray(err.details) && err.details.length) return String(err.details[0]);
    if (err.code === 'COURSE_NOT_READY' && Array.isArray(err.details)) return `${err.message}: ${err.details.join(' ')}`;
    return err.message;
  }
  return fallback;
}

export const get = <T>(url: string, params?: object) => api.get<T>(url, { params }).then((r) => r.data);
export const post = <T>(url: string, body?: unknown) => api.post<T>(url, body).then((r) => r.data);
export const patch = <T>(url: string, body?: unknown) => api.patch<T>(url, body).then((r) => r.data);
export const put = <T>(url: string, body?: unknown) => api.put<T>(url, body).then((r) => r.data);
export const del = <T>(url: string) => api.delete<T>(url).then((r) => r.data);
