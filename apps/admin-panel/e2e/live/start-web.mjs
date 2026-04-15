import { spawn } from 'node:child_process';

const webPort = process.env.E2E_WEB_PORT ?? '5174';
const webHost = process.env.E2E_WEB_HOST ?? 'localhost';
const apiBase = process.env.E2E_API_BASE_URL ?? 'http://127.0.0.1:3000';

const child = spawn(
  'corepack',
  ['pnpm', 'dev', '--host', webHost, '--port', webPort, '--strictPort', '--mode', 'test'],
  {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: {
      ...process.env,
      // Keep same-origin (no CORS) by using the Vite dev proxy.
      VITE_DEV_PROXY_TARGET: apiBase,
      // Avoid demo fallbacks masking backend failures.
      VITE_ENABLE_DEMO_FALLBACKS: 'false',
    },
  },
);

child.on('exit', (code) => process.exit(code ?? 0));
child.on('error', (err) => {
  console.error('[start-web] failed:', err);
  process.exit(1);
});
