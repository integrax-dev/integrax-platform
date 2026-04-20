import { ok, fail, connErr, type ConnectorTesterFn } from './_types.js';

export const connectorId = 'contabilium';

export const testConnection: ConnectorTesterFn = async (credentials) => {
  const start = Date.now();
  const { api_key, company_id } = credentials;
  if (!api_key) return fail(start, 'MISSING_CREDENTIALS', 'api_key is required');
  try {
    const res = await fetch('https://rest.contabilium.com/api/v2/empresa', {
      headers: { Authorization: `Bearer ${api_key}`, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return fail(start, 'AUTH_FAILED', `HTTP ${res.status}`);
    const data = await res.json() as { RazonSocial?: string };
    return ok(start, { companyName: data.RazonSocial, companyId: company_id });
  } catch (e) { return connErr(start, e); }
};
