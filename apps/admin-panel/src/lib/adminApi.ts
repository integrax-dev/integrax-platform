import { buildAdminApiUrl } from './runtime';

function isLikelyHtml(payload: string): boolean {
  const value = payload.trim().toLowerCase();
  return value.startsWith('<!doctype html') || value.startsWith('<html') || value.startsWith('<');
}

// Token getter injected by the auth store to avoid circular imports.
let _getToken: (() => string | null) | null = null;

export function setTokenGetter(getter: () => string | null): void {
  _getToken = getter;
}

export async function fetchAdminJson<T>(path: string, init?: RequestInit): Promise<T> {
  const token = _getToken?.();
  const authHeader: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};

  const response = await fetch(buildAdminApiUrl(path), {
    ...init,
    headers: { ...authHeader, ...(init?.headers ?? {}) },
  });

  if (response.status === 401) {
    window.location.href = '/login';
    throw new Error('HTTP_401');
  }

  if (!response.ok) {
    throw new Error(`HTTP_${response.status}`);
  }

  const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
  const body = await response.text();

  if (!contentType.includes('application/json') || isLikelyHtml(body)) {
    throw new Error('API_RESPONSE_NOT_JSON');
  }

  try {
    return JSON.parse(body) as T;
  } catch {
    throw new Error('API_INVALID_JSON');
  }
}
