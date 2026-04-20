import { ok, fail, connErr, type ConnectorTesterFn } from './_types.js';

export const connectorId = 'mercadopago';

export const testConnection: ConnectorTesterFn = async (credentials) => {
  const start = Date.now();
  const token = credentials['access_token'] ?? credentials['accessToken'];
  if (!token) return fail(start, 'MISSING_CREDENTIALS', 'access_token is required');
  try {
    const res = await fetch('https://api.mercadopago.com/users/me', {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as { message?: string };
      return fail(start, 'AUTH_FAILED', err.message ?? `HTTP ${res.status}`);
    }
    const data = await res.json() as { id: number; email: string };
    return ok(start, { userId: data.id, email: data.email });
  } catch (e) { return connErr(start, e); }
};
