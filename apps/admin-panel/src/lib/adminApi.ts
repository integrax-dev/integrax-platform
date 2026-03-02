import { buildAdminApiUrl } from './runtime';

function isLikelyHtml(payload: string): boolean {
  const value = payload.trim().toLowerCase();
  return value.startsWith('<!doctype html') || value.startsWith('<html') || value.startsWith('<');
}

export async function fetchAdminJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(buildAdminApiUrl(path), init);

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
