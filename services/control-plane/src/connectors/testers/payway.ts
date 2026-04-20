import { ok, fail, type ConnectorTesterFn } from './_types.js';

export const connectorId = 'payway';

export const testConnection: ConnectorTesterFn = async (credentials) => {
  const start = Date.now();
  const { site_id, api_key, public_key } = credentials;
  if (!site_id || !api_key || !public_key) return fail(start, 'MISSING_CREDENTIALS', 'site_id, api_key, public_key required');
  return ok(start, { siteId: site_id, note: 'Credential format validated. Live test requires Payway sandbox endpoint.' });
};
