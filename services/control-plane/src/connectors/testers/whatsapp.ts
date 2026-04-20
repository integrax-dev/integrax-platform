import { ok, fail, connErr, type ConnectorTesterFn } from './_types.js';

export const connectorId = 'whatsapp';

export const testConnection: ConnectorTesterFn = async (credentials) => {
  const start = Date.now();
  const { phone_number_id, access_token } = credentials;
  if (!phone_number_id || !access_token) return fail(start, 'MISSING_CREDENTIALS', 'phone_number_id and access_token are required');
  try {
    const res = await fetch(`https://graph.facebook.com/v18.0/${phone_number_id}`, {
      headers: { Authorization: `Bearer ${access_token}` },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as { error?: { message?: string } };
      return fail(start, 'AUTH_FAILED', err.error?.message ?? `HTTP ${res.status}`);
    }
    const data = await res.json() as { id: string; display_phone_number: string; verified_name: string };
    return ok(start, { phoneNumberId: data.id, displayPhoneNumber: data.display_phone_number, verifiedName: data.verified_name });
  } catch (e) { return connErr(start, e); }
};
