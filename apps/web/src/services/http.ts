import axios, { AxiosError } from 'axios';

export const TOKEN_STORAGE_KEY = 'bookstudio.token';

export const http = axios.create({
  baseURL: '/api',
  timeout: 15_000,
  headers: { 'Content-Type': 'application/json' },
});

http.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_STORAGE_KEY);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

interface ApiErrorBody {
  error?: { code?: string; message?: string; details?: unknown };
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

http.interceptors.response.use(
  (response) => response,
  (error: AxiosError<ApiErrorBody>) => {
    if (error.response) {
      const { status, data } = error.response;
      if (status === 401) localStorage.removeItem(TOKEN_STORAGE_KEY);
      return Promise.reject(
        new ApiError(
          data?.error?.message ?? `Error ${status}`,
          status,
          data?.error?.code ?? 'UNKNOWN',
          data?.error?.details,
        ),
      );
    }
    if (error.code === 'ECONNABORTED') {
      return Promise.reject(new ApiError('La solicitud tardo demasiado', 0, 'TIMEOUT'));
    }
    return Promise.reject(new ApiError('No se pudo conectar con el servidor', 0, 'NETWORK_ERROR'));
  },
);

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Ocurrio un error inesperado';
}
