import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { Socket } from 'node:net';

const tenantId = 'ten_mvp_demo';
const reportId = '11111111-1111-4111-8111-111111111111';
const adminEmail = process.env.ADMIN_EMAIL ?? 'admin@integrax.io';
const adminPassword = process.env.ADMIN_PASSWORD ?? 'integrax-dev';

function ensureEnv(): void {
  process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
  process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'integrax-dev-secret-DO-NOT-USE-IN-PRODUCTION';
  process.env.ADMIN_EMAIL = adminEmail;
  process.env.ADMIN_PASSWORD = adminPassword;
  process.env.DATABASE_URL =
    process.env.DATABASE_URL ?? 'postgresql://integrax:integrax@127.0.0.1:5432/integrax';
  process.env.POSTGRES_HOST = process.env.POSTGRES_HOST ?? '127.0.0.1';
  process.env.POSTGRES_PORT = process.env.POSTGRES_PORT ?? '5432';
}

function runSeed(): void {
  const tsxCli = join(process.cwd(), 'node_modules', 'tsx', 'dist', 'cli.mjs');
  const result = spawnSync(process.execPath, [tsxCli, 'scripts/seed-mvp-demo.ts'], {
    cwd: process.cwd(),
    stdio: 'inherit',
    shell: false,
    env: process.env,
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(`seed:mvp-demo failed with exit code ${result.status ?? 'unknown'}`);
  }
}

async function assertPortOpen(host: string, port: number, label: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const socket = new Socket();
    socket.setTimeout(1500);

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

function authHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    'X-Tenant-Id': tenantId,
    'Content-Type': 'application/json',
  };
}

async function parseJson(response: Response): Promise<any> {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Expected JSON response from ${response.url}, got: ${text.slice(0, 200)}`);
  }
}

async function assertOk(response: Response, context: string): Promise<any> {
  const payload = await parseJson(response);
  if (!response.ok) {
    throw new Error(`${context} failed with HTTP ${response.status}: ${JSON.stringify(payload)}`);
  }
  return payload;
}

async function main(): Promise<void> {
  ensureEnv();
  await assertPortOpen(process.env.POSTGRES_HOST ?? '127.0.0.1', Number(process.env.POSTGRES_PORT ?? 5432), 'Postgres');
  runSeed();

  const [{ app }, { pool }] = await Promise.all([
    import('../services/control-plane/src/server.ts'),
    import('../services/control-plane/src/store/db.ts'),
  ]);

  let server: ReturnType<typeof app.listen> | null = null;

  try {
    const baseUrl = await new Promise<string>((resolve, reject) => {
      const instance = app.listen(0, '127.0.0.1', () => {
        server = instance;
        const address = instance.address();
        if (!address || typeof address === 'string') {
          reject(new Error('Unexpected server address'));
          return;
        }
        resolve(`http://127.0.0.1:${address.port}`);
      });
    });

    console.log(`[mvp-demo] control-plane listening at ${baseUrl}`);

    const loginResponse = await fetch(`${baseUrl}/api/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: adminEmail, password: adminPassword }),
    });
    const loginPayload = await assertOk(loginResponse, 'admin login');
    const token = loginPayload.token as string | undefined;

    if (!token) {
      throw new Error('admin login did not return a token');
    }

    const dashboardPayload = await assertOk(
      await fetch(`${baseUrl}/api/admin/dashboard`, {
        headers: { Authorization: `Bearer ${token}` },
      }),
      'dashboard',
    );

    if ((dashboardPayload.stats?.openIncidents ?? 0) < 0) {
      throw new Error('dashboard returned invalid openIncidents');
    }

    const incidentsPayload = await assertOk(
      await fetch(`${baseUrl}/api/incidents`, {
        headers: authHeaders(token),
      }),
      'incidents list',
    );

    const incidents = incidentsPayload.data as Array<any>;
    const incident = incidents.find(item => item.reportId === reportId);

    if (!incident) {
      throw new Error('seeded MVP incident was not returned by /api/incidents');
    }

    const reportsPayload = await assertOk(
      await fetch(`${baseUrl}/api/schemas/reports`, {
        headers: authHeaders(token),
      }),
      'schema reports list',
    );

    const reports = reportsPayload.data as Array<any>;
    if (!reports.some(item => item.id === reportId)) {
      throw new Error('seeded MVP report was not returned by /api/schemas/reports');
    }

    await assertOk(
      await fetch(`${baseUrl}/api/incidents/${incident.id}/investigating`, {
        method: 'POST',
        headers: authHeaders(token),
      }),
      'incident investigating',
    );

    const reportPayload = await assertOk(
      await fetch(`${baseUrl}/api/schemas/reports/${incident.reportId}`, {
        headers: authHeaders(token),
      }),
      'schema report',
    );

    const report = reportPayload.data as any;
    const mapping = report?.diff_payload?.mappings?.[0];
    if (!mapping?.pathA || !mapping?.pathB) {
      throw new Error('schema report did not return a usable mapping suggestion');
    }

    const feedbackPayload = await assertOk(
      await fetch(`${baseUrl}/api/schemas/reports/${incident.reportId}/feedback`, {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({
          sourcePath: mapping.pathA,
          targetPath: mapping.pathB,
          accepted: true,
          confidence: mapping.confidence ?? 0.9,
        }),
      }),
      'mapping feedback',
    );

    if (feedbackPayload.data?.feedbackRecorded !== true) {
      throw new Error('feedback endpoint did not confirm feedbackRecorded');
    }

    const memoryPayload = await assertOk(
      await fetch(`${baseUrl}/api/schemas/memory?connectorAId=mercadopago&connectorBId=contabilium`, {
        headers: authHeaders(token),
      }),
      'mapping memory',
    );

    const entries = memoryPayload.data as Array<any>;
    if (!entries.some(entry => entry.sourcePath === mapping.pathA && entry.targetPath === mapping.pathB)) {
      throw new Error('mapping memory did not include the accepted mapping');
    }

    await assertOk(
      await fetch(`${baseUrl}/api/incidents/${incident.id}/resolve`, {
        method: 'POST',
        headers: authHeaders(token),
      }),
      'incident resolve',
    );

    const summary = {
      dashboard: {
        openIncidents: dashboardPayload.stats.openIncidents,
        avgCoverage: dashboardPayload.stats.avgCoverage,
      },
      incidentId: incident.id,
      reportId: incident.reportId,
      reportsListed: reports.length,
      acceptedMapping: `${mapping.pathA} -> ${mapping.pathB}`,
      memoryEntries: entries.length,
    };

    console.log('[mvp-demo] PASS');
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    if (server) {
      await new Promise<void>((resolve, reject) => {
        server!.close(error => (error ? reject(error) : resolve()));
      });
    }

    const importedDb = await import('../services/control-plane/src/store/db.ts');
    await importedDb.pool.end();
  }
}

main().catch(error => {
  console.error('[mvp-demo] FAIL');
  console.error(error instanceof Error ? error.message : error);
  console.error('Hint: run `npm run docker:mvp` or bring up Postgres before `npm run test:mvp-demo`.');
  process.exitCode = 1;
});
