/**
 * Connector connection testers
 *
 * Each tester validates credentials and returns a TestConnectionResult.
 * Centralised here so the route handler stays thin and new connectors
 * only need to add one entry to CONNECTOR_TESTERS — no route changes.
 */

export interface TestConnectionResult {
  success: boolean;
  testedAt: Date;
  latencyMs: number;
  error?: { code: string; message: string };
  details?: Record<string, unknown>;
}

type ConnectorTester = (credentials: Record<string, string>) => Promise<TestConnectionResult>;

// ─── Individual testers ────────────────────────────────────────────────────────

async function testMercadoPago(credentials: Record<string, string>): Promise<TestConnectionResult> {
  const start = Date.now();
  const token = credentials.access_token ?? credentials.accessToken;
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
}

async function testWhatsApp(credentials: Record<string, string>): Promise<TestConnectionResult> {
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
}

async function testEmail(credentials: Record<string, string>): Promise<TestConnectionResult> {
  const start = Date.now();
  const { smtp_host, smtp_port, smtp_user, smtp_password } = credentials;
  if (!smtp_host || !smtp_user || !smtp_password) return fail(start, 'MISSING_CREDENTIALS', 'smtp_host, smtp_user, smtp_password required');
  try {
    const nodemailer = await import('nodemailer');
    const t = nodemailer.createTransport({
      host: smtp_host,
      port: parseInt(smtp_port ?? '587', 10),
      secure: smtp_port === '465',
      auth: { user: smtp_user, pass: smtp_password },
      connectionTimeout: 10000,
    });
    await t.verify();
    t.close();
    return ok(start, { host: smtp_host, user: smtp_user });
  } catch (e) { return connErr(start, e); }
}

async function testGoogleSheets(credentials: Record<string, string>): Promise<TestConnectionResult> {
  const start = Date.now();
  const { service_account_json } = credentials;
  if (!service_account_json) return fail(start, 'MISSING_CREDENTIALS', 'service_account_json is required');
  try {
    const sa = JSON.parse(service_account_json) as { client_email?: string; project_id?: string };
    if (!sa.client_email || !sa.project_id) return fail(start, 'INVALID_CREDENTIALS', 'Invalid service account JSON');
    return ok(start, { clientEmail: sa.client_email, projectId: sa.project_id, note: 'Credential format validated. Full test requires spreadsheet access.' });
  } catch { return fail(start, 'INVALID_JSON', 'Invalid service account JSON'); }
}

async function testContabilium(credentials: Record<string, string>): Promise<TestConnectionResult> {
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
}

async function testAfipWsfe(credentials: Record<string, string>): Promise<TestConnectionResult> {
  const start = Date.now();
  const { cuit, certificate, private_key, environment } = credentials;
  if (!cuit || !certificate || !private_key) return fail(start, 'MISSING_CREDENTIALS', 'cuit, certificate, private_key required');
  if (!certificate.includes('BEGIN CERTIFICATE') || !private_key.includes('BEGIN')) {
    return fail(start, 'INVALID_CREDENTIALS', 'Invalid certificate or private key format');
  }
  return ok(start, { cuit, environment: environment ?? 'testing', note: 'Format validated. Full AFIP auth requires CMS signing.' });
}

async function testTiendaNube(credentials: Record<string, string>): Promise<TestConnectionResult> {
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
}

// Tier 1 PSP connectors (stub — real endpoints TBD when connectors are implemented)
async function testPayway(credentials: Record<string, string>): Promise<TestConnectionResult> {
  const start = Date.now();
  const { site_id, api_key, public_key } = credentials;
  if (!site_id || !api_key || !public_key) return fail(start, 'MISSING_CREDENTIALS', 'site_id, api_key, public_key required');
  return ok(start, { siteId: site_id, note: 'Credential format validated. Live test requires Payway sandbox endpoint.' });
}

async function testMobbex(credentials: Record<string, string>): Promise<TestConnectionResult> {
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
}

async function testDecidir(credentials: Record<string, string>): Promise<TestConnectionResult> {
  const start = Date.now();
  const { private_api_key, public_api_key } = credentials;
  if (!private_api_key || !public_api_key) return fail(start, 'MISSING_CREDENTIALS', 'private_api_key and public_api_key required');
  try {
    const base = credentials.sandbox === 'true'
      ? 'https://developers.decidir.com/api/v2'
      : 'https://live.decidir.com/api/v2';
    const res = await fetch(`${base}/healthcheck`, {
      headers: { 'apikey': private_api_key },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return fail(start, 'AUTH_FAILED', `HTTP ${res.status}`);
    return ok(start, { sandbox: credentials.sandbox === 'true' });
  } catch (e) { return connErr(start, e); }
}

// ─── Registry ─────────────────────────────────────────────────────────────────

export const CONNECTOR_TESTERS: Record<string, ConnectorTester> = {
  mercadopago:    testMercadoPago,
  whatsapp:       testWhatsApp,
  email:          testEmail,
  'google-sheets': testGoogleSheets,
  contabilium:    testContabilium,
  'afip-wsfe':    testAfipWsfe,
  tiendanube:     testTiendaNube,
  payway:         testPayway,
  mobbex:         testMobbex,
  decidir:        testDecidir,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fail(start: number, code: string, message: string): TestConnectionResult {
  return { success: false, testedAt: new Date(), latencyMs: Date.now() - start, error: { code, message } };
}

function ok(start: number, details: Record<string, unknown>): TestConnectionResult {
  return { success: true, testedAt: new Date(), latencyMs: Date.now() - start, details };
}

function connErr(start: number, e: unknown): TestConnectionResult {
  return fail(start, 'CONNECTION_ERROR', e instanceof Error ? e.message : 'Unknown error');
}
