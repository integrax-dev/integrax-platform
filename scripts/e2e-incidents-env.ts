/**
 * Live E2E environment runner for the admin-panel Incidents page.
 *
 * Brings up isolated Postgres+Redis via docker compose, starts the control-plane
 * locally (tsx dev), runs Playwright live tests (seed + assertions + cleanup via
 * real APIs), then tears everything down (including Docker volumes).
 *
 * Usage:
 *   pnpm run test:e2e:incidents:env
 *
 * Notes:
 * - Requires Docker + docker compose.
 * - Does NOT call LLM/Temporal endpoints (no token spend).
 */

import { spawn } from 'node:child_process';
import net from 'node:net';

const COMPOSE_FILE = 'infra/docker-compose/e2e/drift.yml';
const DEFAULT_API_PORT = process.env.E2E_API_PORT ? Number(process.env.E2E_API_PORT) : null;
const DEFAULT_PG_PORT = process.env.E2E_PG_PORT ? Number(process.env.E2E_PG_PORT) : null;
const DEFAULT_REDIS_PORT = process.env.E2E_REDIS_PORT ? Number(process.env.E2E_REDIS_PORT) : null;
const DEFAULT_WEB_PORT = process.env.E2E_WEB_PORT ? Number(process.env.E2E_WEB_PORT) : null;

function run(cmd: string, args: string[], opts: { env?: NodeJS.ProcessEnv } = {}): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, {
      stdio: ['inherit', 'pipe', 'pipe'],
      shell: process.platform === 'win32',
      env: { ...process.env, ...(opts.env ?? {}) },
    });
    p.stdout?.on('data', (d) => process.stdout.write(d));
    p.stderr?.on('data', (d) => process.stderr.write(d));
    p.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} ${args.join(' ')} exited with ${code}`))));
    p.on('error', reject);
  });
}

function waitForExit(proc: ReturnType<typeof spawn>, timeoutMs = 15_000): Promise<boolean> {
  if (proc.exitCode !== null) return Promise.resolve(true);
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), timeoutMs);
    proc.once('exit', () => {
      clearTimeout(timer);
      resolve(true);
    });
  });
}

async function canListen(port: number, host: string): Promise<boolean> {
  return await new Promise((resolve) => {
    const srv = net.createServer();
    const timer = setTimeout(() => {
      try {
        srv.close();
      } catch {
        // ignore
      }
      // If the OS never answers (seen on some Windows IPv6 configs), don't block E2E startup.
      resolve(true);
    }, 1000);
    srv.once('error', (err: any) => {
      clearTimeout(timer);
      // If the host family isn't available on this machine, don't treat it as "in use".
      if (err?.code === 'EADDRNOTAVAIL' || err?.code === 'EINVAL') return resolve(true);
      return resolve(false);
    });
    srv.listen(port, host, () => {
      clearTimeout(timer);
      srv.close(() => resolve(true));
    });
  });
}

async function isPortFree(port: number): Promise<boolean> {
  const v4 = await canListen(port, '127.0.0.1');
  if (!v4) return false;
  const v6 = await canListen(port, '::');
  return v6;
}

async function allocateEphemeralPort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      if (!addr || typeof addr === 'string') return reject(new Error('Could not allocate ephemeral port'));
      const { port } = addr;
      srv.close(() => resolve(port));
    });
  });
}

async function findFreePort(preferred: number, _host = '127.0.0.1', maxTries = 25): Promise<number> {
  for (let i = 0; i < maxTries; i++) {
    const candidate = preferred + i;
    // eslint-disable-next-line no-await-in-loop
    if (await isPortFree(candidate)) return candidate;
  }
  throw new Error(`Could not find a free port near ${preferred}`);
}

async function waitForReady(url: string, timeoutMs = 180_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 2_000);
      const res = await fetch(url, { method: 'GET', signal: controller.signal });
      clearTimeout(t);
      if (res.ok) return;
    } catch {
      // ignore
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`Timed out waiting for ready: ${url}`);
}

async function main(): Promise<void> {
  const runId = `integrax_e2e_${Date.now()}`;
  const apiPort = DEFAULT_API_PORT ?? await allocateEphemeralPort();
  const pgPort = DEFAULT_PG_PORT ?? await allocateEphemeralPort();
  const redisPort = DEFAULT_REDIS_PORT ?? await allocateEphemeralPort();
  const webPort = DEFAULT_WEB_PORT ?? await allocateEphemeralPort();
  const apiBaseUrl = `http://127.0.0.1:${apiPort}`;

  console.log(`[e2e] Starting docker compose (project=${runId})...`);
  await run('docker', ['compose', '-p', runId, '-f', COMPOSE_FILE, 'up', '-d'], {
    env: {
      E2E_PG_PORT: String(pgPort),
      E2E_REDIS_PORT: String(redisPort),
    },
  });

  console.log(`[e2e] Starting control-plane (PORT=${apiPort})...`);
  const controlPlane = spawn(
    process.execPath,
    ['--import', 'tsx', 'src/server.ts'],
    {
      cwd: 'services/control-plane',
      stdio: ['inherit', 'pipe', 'pipe'],
      shell: false,
      env: {
        ...process.env,
        PORT: String(apiPort),
        DATABASE_URL: `postgresql://integrax:integrax@127.0.0.1:${pgPort}/integrax`,
        REDIS_URL: `redis://127.0.0.1:${redisPort}`,
        // Ensure predictable admin creds for E2E
        ADMIN_EMAIL: process.env.E2E_ADMIN_EMAIL ?? process.env.ADMIN_EMAIL ?? 'admin@integrax.io',
        ADMIN_PASSWORD: process.env.E2E_ADMIN_PASSWORD ?? process.env.ADMIN_PASSWORD ?? 'integrax-dev',
      },
    },
  );
  controlPlane.stdout?.on('data', (d) => process.stdout.write(d));
  controlPlane.stderr?.on('data', (d) => process.stderr.write(d));

  try {
    console.log('[e2e] Waiting for control-plane readiness...');
    await waitForReady(`${apiBaseUrl.replace(/\/$/, '')}/ready`);

    console.log('[e2e] Running admin-panel live Playwright tests...');
    await run('corepack', ['pnpm', '-C', 'apps/admin-panel', 'run', 'test:e2e:live'], {
      env: {
        E2E_API_BASE_URL: apiBaseUrl,
        E2E_WEB_PORT: String(webPort),
        E2E_WEB_BASE_URL: `http://localhost:${webPort}`,
      },
    });
  } finally {
    console.log('[e2e] Stopping control-plane...');
    try {
      // Try graceful shutdown first so PG doesn't log noisy "admin command" errors
      controlPlane.kill('SIGINT');
    } catch {
      // ignore
    }

    const exited = await waitForExit(controlPlane, 20_000);
    if (!exited && controlPlane.pid) {
      try {
        if (process.platform === 'win32') {
          await run('taskkill', ['/PID', String(controlPlane.pid), '/T', '/F']);
        } else {
          controlPlane.kill('SIGKILL');
        }
      } catch {
        // ignore
      }
    }

    console.log(`[e2e] Tearing down docker compose (project=${runId})...`);
    await run('docker', ['compose', '-p', runId, '-f', COMPOSE_FILE, 'down', '-v']).catch((err) => {
      console.warn('[e2e] docker compose down failed:', err instanceof Error ? err.message : String(err));
    });
  }
}

main().catch((err) => {
  console.error('[e2e] Failed:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
