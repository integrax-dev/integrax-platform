/**
 * Activepieces admin session manager.
 *
 * On first call, signs in to AP with the configured admin credentials.
 * If no account exists yet, auto-registers one (first-run scenario).
 * The JWT is cached for 23 h and transparently refreshed.
 *
 * This removes the manual "sign up in AP" step for every deployment.
 */

function apApiBase(): string | null {
  const raw = process.env.ACTIVEPIECES_BASE_URL;
  if (!raw) return null;
  const trimmed = raw.replace(/\/$/, '');
  return trimmed.endsWith('/api') ? trimmed : `${trimmed}/api`;
}

interface ApSession {
  token: string;
  projectId: string;
  expiresAt: number;
}

let _session: ApSession | null = null;

async function trySignIn(base: string, email: string, password: string): Promise<ApSession | null> {
  try {
    const res = await fetch(`${base}/v1/authentication/sign-in`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = await res.json() as { token: string; projectId: string };
    return {
      token: data.token,
      projectId: data.projectId,
      expiresAt: Date.now() + 23 * 60 * 60 * 1000,
    };
  } catch {
    return null;
  }
}

async function trySignUp(base: string, email: string, password: string): Promise<ApSession | null> {
  try {
    const res = await fetch(`${base}/v1/authentication/sign-up`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ firstName: 'IntegraX', lastName: 'Admin', email, password }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = await res.json() as { token: string; projectId: string };
    return {
      token: data.token,
      projectId: data.projectId,
      expiresAt: Date.now() + 23 * 60 * 60 * 1000,
    };
  } catch {
    return null;
  }
}

export async function getApSession(): Promise<ApSession | null> {
  if (_session && _session.expiresAt > Date.now()) return _session;

  const base = apApiBase();
  if (!base) return null;

  const email = process.env.AP_ADMIN_EMAIL ?? process.env.ADMIN_EMAIL ?? 'admin@integrax.io';
  const password = process.env.AP_ADMIN_PASSWORD ?? process.env.ADMIN_PASSWORD ?? 'integrax-dev';

  // Try sign-in first; if no account exists yet, register automatically.
  const session = (await trySignIn(base, email, password)) ?? (await trySignUp(base, email, password));
  if (session) _session = session;
  return session;
}

export function invalidateApSession(): void {
  _session = null;
}
