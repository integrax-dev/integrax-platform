import { ok, fail, connErr, type ConnectorTesterFn } from './_types.js';

export const connectorId = 'tiendanube';

export const testConnection: ConnectorTesterFn = async (credentials) => {
  const start = Date.now();
  const { store_id, access_token } = credentials;
  if (!store_id || !access_token) return fail(start, 'MISSING_CREDENTIALS', 'store_id and access_token required');
  try {
    const res = await fetch(`https://api.tiendanube.com/v1/${store_id}/store`, {
      headers: { Authentication: `bearer ${access_token}`, 'User-Agent': 'IntegraX/1.0' },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return fail(start, 'AUTH_FAILED', `HTTP ${res.status}`);
    const data = await res.json() as { name?: { es?: string } };
    return ok(start, { storeId: store_id, storeName: data.name?.es });
  } catch (e) { return connErr(start, e); }
};
