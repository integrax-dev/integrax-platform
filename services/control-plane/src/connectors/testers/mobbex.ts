import { ok, fail, connErr, type ConnectorTesterFn } from './_types.js';

export const connectorId = 'mobbex';

export const testConnection: ConnectorTesterFn = async (credentials) => {
  const start = Date.now();
  const { api_key, access_token } = credentials;
  if (!api_key || !access_token) return fail(start, 'MISSING_CREDENTIALS', 'api_key and access_token required');
  try {
    const res = await fetch('https://res.mobbex.com/p/merchant', {
      headers: { 'x-api-key': api_key, 'x-access-token': access_token },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return fail(start, 'AUTH_FAILED', `HTTP ${res.status}`);
    const data = await res.json() as { merchant?: { name?: string } };
    return ok(start, { merchant: data.merchant?.name });
  } catch (e) { return connErr(start, e); }
};
