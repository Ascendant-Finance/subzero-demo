'use client';

import { ERROR_CODES, type ApiErrorBody, type ErrorCode } from '@trello-clone/shared';
import { API_BASE } from './config';
import { getAccessToken, setSession } from './auth-store';

export class ApiError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** Set internally to stop a refresh loop. */
  retrying?: boolean;
  signal?: AbortSignal;
}

let refreshInFlight: Promise<boolean> | null = null;

/** Refreshes once and shares the result with every request waiting on it. */
async function refreshAccessToken(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        const response = await fetch(`${API_BASE}/auth/refresh`, {
          method: 'POST',
          credentials: 'include',
        });
        if (!response.ok) return false;
        const data = (await response.json()) as { accessToken: string };

        const me = await fetch(`${API_BASE}/auth/me`, {
          headers: { Authorization: `Bearer ${data.accessToken}` },
          credentials: 'include',
        });
        if (!me.ok) return false;
        const meData = await me.json();
        setSession(data.accessToken, meData.user);
        return true;
      } catch {
        return false;
      } finally {
        // Cleared on the next tick so concurrent callers share this attempt.
        setTimeout(() => {
          refreshInFlight = null;
        }, 0);
      }
    })();
  }
  return refreshInFlight;
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const token = getAccessToken();
  const response = await fetch(`${API_BASE}${path}`, {
    method: options.method ?? 'GET',
    credentials: 'include',
    signal: options.signal,
    headers: {
      ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  });

  if (response.ok) {
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }

  let payload: ApiErrorBody | null = null;
  try {
    payload = (await response.json()) as ApiErrorBody;
  } catch {
    payload = null;
  }

  const code = payload?.error?.code ?? ERROR_CODES.INTERNAL;
  const message = payload?.error?.message ?? 'Something went wrong. Try again.';

  // Refresh once on an expired access token, then replay the request.
  if (code === ERROR_CODES.TOKEN_EXPIRED && !options.retrying) {
    const refreshed = await refreshAccessToken();
    if (refreshed) return apiRequest<T>(path, { ...options, retrying: true });
  }

  throw new ApiError(code, message, response.status);
}

export const api = {
  get: <T>(path: string, signal?: AbortSignal) => apiRequest<T>(path, { signal }),
  post: <T>(path: string, body?: unknown) => apiRequest<T>(path, { method: 'POST', body }),
  patch: <T>(path: string, body?: unknown) => apiRequest<T>(path, { method: 'PATCH', body }),
  delete: <T>(path: string) => apiRequest<T>(path, { method: 'DELETE' }),
};

/** Restores a session on a cold load using the refresh cookie. */
export async function restoreSession(): Promise<boolean> {
  return refreshAccessToken();
}
