import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { join } from 'node:path';
import { Socket } from 'node:net';

const rootDir = process.cwd();
const tsxCli = join(rootDir, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const controlPlanePort = process.env.MVP_UI_CONTROL_PLANE_PORT ?? '3100';
const adminPanelPort = process.env.MVP_UI_ADMIN_PANEL_PORT ?? '4273';
const controlPlaneBaseUrl = `http://127.0.0.1:${controlPlanePort}`;
const adminPanelBaseUrl = `http://127.0.0.1:${adminPanelPort}`;

function prefixedPipe(child: ChildProcess, label: string): void {
  child.stdout?.on('data', chunk => {
    process.stdout.write(`[${label}] ${chunk}`);
  });
  child.stderr?.on('data', chunk => {
    process.stderr.write(`[${label}] ${chunk}`);
  });
}

function runSeed(): void {
  const result = spawnSync(process.execPath, [tsxCli, 'scripts/seed-mvp-demo.ts'], {
    cwd: rootDir,
    env: {
      ...process.env,
      DATABASE_URL: process.env.DATABASE_URL ?? 'postgresql://integrax:integrax@127.0.0.1:5432/integrax',
    },
    stdio: 'inherit',
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(`seed:mvp-demo failed with exit code ${result.status ?? 'unknown'}`);
  }
}

async function waitForHttp(url: string, label: string, timeoutMs = 60_000): Promise<void> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Retry until timeout.
    }

    await new Promise(resolve => setTimeout(resolve, 750));
  }

  throw new Error(`${label} did not become ready at ${url}`);
}

async function isHttpReady(url: string): Promise<boolean> {
  try {
    const response = await fetch(url);
    return response.ok;
  } catch {
    return false;
  }
}

async function assertPortOpen(host: string, port: number, label: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const socket = new Socket();
    socket.setTimeout(1_500);

    socket.once('connect', () => {
      socket.destroy();
      resolve();
    });

    socket.once('timeout', () => {
      socket.destroy();
      reject(new Error(`${label} is not reachable at ${host}:${port}`));
    });

    socket.once('error', () => {
      socket.destroy();
      reject(new Error(`${label} is not reachable at ${host}:${port}`));
    });

    socket.connect(port, host);
  });
}

async function main(): Promise<void> {
  await assertPortOpen('127.0.0.1', 5432, 'Postgres');
  runSeed();

  const children: ChildProcess[] = [];

  if (!(await isHttpReady(`${controlPlaneBaseUrl}/health`))) {
    const controlPlane = spawn(process.execPath, [tsxCli, 'services/control-plane/src/server.ts'], {
      cwd: rootDir,
      env: {
        ...process.env,
        START_SERVER: 'true',
        NODE_ENV: 'test',
        PORT: controlPlanePort,
        JWT_SECRET: process.env.JWT_SECRET ?? 'integrax-dev-secret-DO-NOT-USE-IN-PRODUCTION',
        ADMIN_EMAIL: process.env.ADMIN_EMAIL ?? 'admin@integrax.io',
        ADMIN_PASSWORD: process.env.ADMIN_PASSWORD ?? 'integrax-dev',
        DATABASE_URL: process.env.DATABASE_URL ?? 'postgresql://integrax:integrax@127.0.0.1:5432/integrax',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    prefixedPipe(controlPlane, 'control-plane');
    children.push(controlPlane);
  } else {
    console.log(`[mvp-ui] reusing existing control-plane on ${controlPlaneBaseUrl}`);
  }

  if (!(await isHttpReady(`${adminPanelBaseUrl}/login`))) {
    const adminPanel = spawn(
      process.platform === 'win32' ? 'npm.cmd' : 'npm',
      ['run', 'dev', '--', '--host', '127.0.0.1', '--port', adminPanelPort],
      {
        cwd: join(rootDir, 'apps', 'admin-panel'),
        env: {
          ...process.env,
          VITE_APP_ENV: 'prod',
          VITE_ENABLE_DEMO_FALLBACKS: 'false',
          VITE_ADMIN_API_BASE_URL: controlPlaneBaseUrl,
          VITE_DEFAULT_TENANT_ID: process.env.VITE_DEFAULT_TENANT_ID ?? 'ten_mvp_demo',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: process.platform === 'win32',
      },
    );
    prefixedPipe(adminPanel, 'admin-panel');
    children.push(adminPanel);
  } else {
    console.log(`[mvp-ui] reusing existing admin-panel on ${adminPanelBaseUrl}`);
  }

  const shutdown = () => {
    for (const child of children) {
      if (!child.killed) {
        child.kill('SIGTERM');
      }
    }
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  for (const child of children) {
    child.once('exit', code => {
      if (code !== null && code !== 0) {
        process.exitCode = code;
        shutdown();
      }
    });
  }

  await Promise.all([
    waitForHttp(`${controlPlaneBaseUrl}/health`, 'control-plane'),
    waitForHttp(`${adminPanelBaseUrl}/login`, 'admin-panel'),
  ]);

  console.log('[mvp-ui] READY');
  console.log(`[mvp-ui] control-plane: ${controlPlaneBaseUrl}`);
  console.log(`[mvp-ui] admin-panel:   ${adminPanelBaseUrl}`);
  console.log(`[mvp-ui] tenant:        ${process.env.VITE_DEFAULT_TENANT_ID ?? 'ten_mvp_demo'}`);
  console.log('[mvp-ui] credentials:   admin@integrax.io / integrax-dev');
  console.log('[mvp-ui] press Ctrl+C to stop');

  if (children.length === 0) {
    await new Promise(() => {});
  }

  await Promise.all(children.map(child => new Promise(resolve => child.once('exit', resolve))));
}

main().catch(error => {
  console.error('[mvp-ui] FAIL');
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
