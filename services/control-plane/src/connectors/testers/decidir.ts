import { ok, fail, connErr, type ConnectorTesterFn } from './_types.js';

export const connectorId = 'decidir';

export const testConnection: ConnectorTesterFn = async (credentials) => {
  const start = Date.now();
  const { private_api_key, public_api_key } = credentials;
  if (!private_api_key || !public_api_key) return fail(start, 'MISSING_CREDENTIALS', 'private_api_key and public_api_key required');
  try {
    const base = credentials['sandbox'] === 'true'
      ? 'https://developers.decidir.com/api/v2'
      : 'https://live.decidir.com/api/v2';
    const res = await fetch(`${base}/healthcheck`, {
      headers: { apikey: private_api_key },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return fail(start, 'AUTH_FAILED', `HTTP ${res.status}`);
    return ok(start, { sandbox: credentials['sandbox'] === 'true' });
  } catch (e) { return connErr(start, e); }
};
