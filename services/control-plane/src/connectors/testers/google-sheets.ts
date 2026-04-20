import { ok, fail, type ConnectorTesterFn } from './_types.js';

export const connectorId = 'google-sheets';

export const testConnection: ConnectorTesterFn = async (credentials) => {
  const start = Date.now();
  const { service_account_json } = credentials;
  if (!service_account_json) return fail(start, 'MISSING_CREDENTIALS', 'service_account_json is required');
  try {
    const sa = JSON.parse(service_account_json) as { client_email?: string; project_id?: string };
    if (!sa.client_email || !sa.project_id) return fail(start, 'INVALID_CREDENTIALS', 'Invalid service account JSON');
    return ok(start, { clientEmail: sa.client_email, projectId: sa.project_id, note: 'Credential format validated. Full test requires spreadsheet access.' });
  } catch { return fail(start, 'INVALID_JSON', 'Invalid service account JSON'); }
};
