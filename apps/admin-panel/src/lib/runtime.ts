type AppEnv = 'dev' | 'staging' | 'prod';

function normalizeEnv(value: string | undefined): AppEnv {
  const env = (value ?? '').trim().toLowerCase();
  if (env === 'production' || env === 'prod') return 'prod';
  if (env === 'staging' || env === 'stage') return 'staging';
  return 'dev';
}

export const appEnv: AppEnv = normalizeEnv(import.meta.env.VITE_APP_ENV ?? import.meta.env.MODE);
export const isProdEnv = appEnv === 'prod';

function parseBoolean(value: string | undefined): boolean | null {
  if (value == null) return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'true' || normalized === '1' || normalized === 'yes') return true;
  if (normalized === 'false' || normalized === '0' || normalized === 'no') return false;
  return null;
}

const explicitDemoFallbacks = parseBoolean(import.meta.env.VITE_ENABLE_DEMO_FALLBACKS);
export const allowDemoFallbacks = explicitDemoFallbacks ?? (appEnv === 'dev' || appEnv === 'staging');

export function getAdminApiBaseUrl(): string {
  return (import.meta.env.VITE_ADMIN_API_BASE_URL ?? '').trim().replace(/\/$/, '');
}

export function buildAdminApiUrl(path: string): string {
  const base = getAdminApiBaseUrl();
  if (!base) return path;
  if (path.startsWith('/')) return `${base}${path}`;
  return `${base}/${path}`;
}
