import { ok, fail, type ConnectorTesterFn } from './_types.js';

export const connectorId = 'afip-wsfe';

export const testConnection: ConnectorTesterFn = async (credentials) => {
  const start = Date.now();
  const { cuit, certificate, private_key, environment } = credentials;
  if (!cuit || !certificate || !private_key) return fail(start, 'MISSING_CREDENTIALS', 'cuit, certificate, private_key required');
  if (!certificate.includes('BEGIN CERTIFICATE') || !private_key.includes('BEGIN')) {
    return fail(start, 'INVALID_CREDENTIALS', 'Invalid certificate or private key format');
  }
  return ok(start, { cuit, environment: environment ?? 'testing', note: 'Format validated. Full AFIP auth requires CMS signing.' });
};
