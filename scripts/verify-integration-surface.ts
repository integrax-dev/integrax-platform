import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createHmac } from 'node:crypto';
import { spawn } from 'node:child_process';
import { ALL_CONTRACTS, CONTRACT_MAP } from '../contracts/ts/src/connector-contracts.ts';
import { createContractTester } from '../contracts/ts/src/contract-tester.ts';

type ProbeStatus =
  | 'verified_real'
  | 'failed_real'
  | 'skipped_missing_auth'
  | 'skipped_missing_config'
  | 'skipped_missing_dependency';

type ExtraProbe =
  | {
      type: 'graphql';
      id: string;
      url: string;
      query?: string;
      variables?: Record<string, unknown>;
      authEnvVar?: string;
      authHeader?: string;
    }
  | {
      type: 'grpc';
      id: string;
      target: string;
      method: string;
      data?: Record<string, unknown>;
      authEnvVar?: string;
      authHeader?: string;
      plaintext?: boolean;
    }
  | {
      type: 'sql';
      id: string;
      connectionEnvVar: string;
      query: string;
      expectedMinRows?: number;
    }
  | {
      type: 'http-contract';
      id: string;
      contractId: string;
    }
  | {
      type: 'kafka';
      id: string;
      brokersEnvVar?: string;
      brokers?: string[];
      topic?: string;
      clientId?: string;
      saslUsernameEnvVar?: string;
      saslPasswordEnvVar?: string;
      producePayload?: Record<string, unknown>;
      required?: boolean;
    }
  | {
      type: 'cdc';
      id: string;
      url: string;
      expectedConnectorState?: string;
      expectedTaskState?: string;
      required?: boolean;
    }
  | {
      type: 'webhook';
      id: string;
      url: string;
      method?: 'POST' | 'PUT' | 'PATCH';
      headers?: Record<string, string>;
      body?: Record<string, unknown>;
      expectedStatus?: number;
      authEnvVar?: string;
      authHeader?: string;
      hmacSecretEnvVar?: string;
      signatureHeader?: string;
      signaturePrefix?: string;
      required?: boolean;
    }
  | {
      type: 'redis';
      id: string;
      urlEnvVar?: string;
      required?: boolean;
    };

interface ProbeResult {
  id: string;
  protocol: 'http-contract' | 'graphql' | 'grpc' | 'sql' | 'kafka' | 'cdc' | 'webhook' | 'redis';
  status: ProbeStatus;
  checkedAt: string;
  details?: string;
  metadata?: Record<string, unknown>;
}

interface IntegrationSurfaceReport {
  generatedAt: string;
  mode: 'multi-protocol-live';
  results: ProbeResult[];
}

function nowIso(): string {
  return new Date().toISOString();
}

function parseProbeArray(raw: string): ExtraProbe[] {
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) return [];
  return parsed as ExtraProbe[];
}

async function parseExtraProbes(): Promise<ExtraProbe[]> {
  const probes: ExtraProbe[] = [];

  const fromFile = process.env.INTEGRATION_PROBES_FILE;
  if (fromFile) {
    try {
      const filePath = resolve(process.cwd(), fromFile);
      const raw = await readFile(filePath, 'utf-8');
      probes.push(...parseProbeArray(raw));
    } catch (error) {
      console.warn('[verify-integration-surface] INTEGRATION_PROBES_FILE inválido:', error);
    }
  }

  const fromEnv = process.env.INTEGRATION_PROBES_JSON;
  if (fromEnv) {
    try {
      probes.push(...parseProbeArray(fromEnv));
    } catch (error) {
      console.warn('[verify-integration-surface] INTEGRATION_PROBES_JSON inválido:', error);
    }
  }

  return probes;
}

function getByPath(value: unknown, path: string): unknown {
  const segments = path.split('.').filter(Boolean);
  let current: unknown = value;
  for (const segment of segments) {
    if (current && typeof current === 'object' && segment in (current as Record<string, unknown>)) {
      current = (current as Record<string, unknown>)[segment];
      continue;
    }
    return undefined;
  }
  return current;
}

function autoInfrastructureProbes(): ExtraProbe[] {
  const probes: ExtraProbe[] = [];

  if (process.env.KAFKA_BROKERS) {
    probes.push({
      type: 'kafka',
      id: 'infra:kafka',
      brokersEnvVar: 'KAFKA_BROKERS',
      topic: process.env.KAFKA_HEALTH_TOPIC ?? 'integrax.healthcheck',
      clientId: process.env.KAFKA_CLIENT_ID ?? 'integrax-surface-check',
      saslUsernameEnvVar: process.env.KAFKA_SASL_USERNAME ? 'KAFKA_SASL_USERNAME' : undefined,
      saslPasswordEnvVar: process.env.KAFKA_SASL_PASSWORD ? 'KAFKA_SASL_PASSWORD' : undefined,
      producePayload: { source: 'verify-surface', timestamp: nowIso() },
      required: false,
    });
  }

  if (process.env.DEBEZIUM_CONNECT_URL) {
    probes.push({
      type: 'cdc',
      id: 'infra:cdc',
      url: `${process.env.DEBEZIUM_CONNECT_URL.replace(/\/$/, '')}/connectors`,
      required: false,
    });
  }

  if (process.env.REDIS_URL) {
    probes.push({
      type: 'redis',
      id: 'infra:redis',
      urlEnvVar: 'REDIS_URL',
      required: false,
    });
  }

  return probes;
}

async function runGraphQlProbe(probe: Extract<ExtraProbe, { type: 'graphql' }>): Promise<ProbeResult> {
  const checkedAt = nowIso();
  const authHeader = probe.authHeader ?? 'Authorization';

  if (probe.authEnvVar && !process.env[probe.authEnvVar]) {
    return {
      id: probe.id,
      protocol: 'graphql',
      status: 'skipped_missing_auth',
      checkedAt,
      details: `Falta variable ${probe.authEnvVar}`,
    };
  }

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (probe.authEnvVar) {
      headers[authHeader] = process.env[probe.authEnvVar] as string;
    }

    const response = await fetch(probe.url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        query: probe.query ?? '{ __typename }',
        variables: probe.variables ?? {},
      }),
    });

    const text = await response.text();
    let payload: unknown = null;
    try {
      payload = JSON.parse(text);
    } catch {
      return {
        id: probe.id,
        protocol: 'graphql',
        status: 'failed_real',
        checkedAt,
        details: `Respuesta no JSON (HTTP ${response.status})`,
      };
    }

    const body = payload as { data?: unknown; errors?: unknown[] };
    const hasErrors = Array.isArray(body.errors) && body.errors.length > 0;

    if (!response.ok || hasErrors) {
      return {
        id: probe.id,
        protocol: 'graphql',
        status: 'failed_real',
        checkedAt,
        details: hasErrors ? 'GraphQL devolvió errors[]' : `HTTP ${response.status}`,
      };
    }

    return {
      id: probe.id,
      protocol: 'graphql',
      status: 'verified_real',
      checkedAt,
      details: 'GraphQL respondió data válida',
    };
  } catch (error) {
    return {
      id: probe.id,
      protocol: 'graphql',
      status: 'failed_real',
      checkedAt,
      details: error instanceof Error ? error.message : 'Error desconocido',
    };
  }
}

function runGrpcurl(args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolvePromise) => {
    const processRef = spawn('grpcurl', args, { stdio: ['ignore', 'pipe', 'pipe'] });

    let stdout = '';
    let stderr = '';

    processRef.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    processRef.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    processRef.on('error', () => {
      resolvePromise({ code: 127, stdout, stderr: 'grpcurl no disponible en PATH' });
    });
    processRef.on('close', (code) => {
      resolvePromise({ code: code ?? 1, stdout, stderr });
    });
  });
}

async function runGrpcProbe(probe: Extract<ExtraProbe, { type: 'grpc' }>): Promise<ProbeResult> {
  const checkedAt = nowIso();
  const authHeader = probe.authHeader ?? 'authorization';

  if (probe.authEnvVar && !process.env[probe.authEnvVar]) {
    return {
      id: probe.id,
      protocol: 'grpc',
      status: 'skipped_missing_auth',
      checkedAt,
      details: `Falta variable ${probe.authEnvVar}`,
    };
  }

  const args: string[] = [];
  if (probe.plaintext) args.push('-plaintext');
  if (probe.authEnvVar) args.push('-H', `${authHeader}: ${process.env[probe.authEnvVar]}`);
  if (probe.data) args.push('-d', JSON.stringify(probe.data));
  args.push(probe.target, probe.method);

  const result = await runGrpcurl(args);

  if (result.code === 127) {
    return {
      id: probe.id,
      protocol: 'grpc',
      status: 'skipped_missing_dependency',
      checkedAt,
      details: 'grpcurl no está instalado',
    };
  }

  if (result.code !== 0) {
    return {
      id: probe.id,
      protocol: 'grpc',
      status: 'failed_real',
      checkedAt,
      details: result.stderr || 'grpcurl falló',
    };
  }

  return {
    id: probe.id,
    protocol: 'grpc',
    status: 'verified_real',
    checkedAt,
    details: 'gRPC respondió correctamente',
  };
}

async function runKafkaProbe(probe: Extract<ExtraProbe, { type: 'kafka' }>): Promise<ProbeResult> {
  const checkedAt = nowIso();
  const brokersRaw = probe.brokers?.join(',') ?? (probe.brokersEnvVar ? process.env[probe.brokersEnvVar] : undefined);

  if (!brokersRaw) {
    return {
      id: probe.id,
      protocol: 'kafka',
      status: probe.required ? 'failed_real' : 'skipped_missing_config',
      checkedAt,
      details: `Falta brokers (${probe.brokersEnvVar ?? 'brokers'})`,
    };
  }

  try {
    const { Kafka } = await import('kafkajs');
    const brokers = brokersRaw.split(',').map((b) => b.trim()).filter(Boolean);
    const username = probe.saslUsernameEnvVar ? process.env[probe.saslUsernameEnvVar] : undefined;
    const password = probe.saslPasswordEnvVar ? process.env[probe.saslPasswordEnvVar] : undefined;

    const kafka = new Kafka({
      clientId: probe.clientId ?? 'integrax-surface-check',
      brokers,
      ...(username && {
        sasl: {
          mechanism: 'plain',
          username,
          password: password ?? '',
        },
        ssl: true,
      }),
    });

    const admin = kafka.admin();
    await admin.connect();
    const topics = await admin.listTopics();
    await admin.disconnect();

    if (probe.topic && !topics.includes(probe.topic)) {
      return {
        id: probe.id,
        protocol: 'kafka',
        status: 'failed_real',
        checkedAt,
        details: `Topic no encontrado: ${probe.topic}`,
      };
    }

    if (probe.topic && probe.producePayload) {
      const producer = kafka.producer();
      await producer.connect();
      await producer.send({
        topic: probe.topic,
        messages: [{ value: JSON.stringify(probe.producePayload) }],
      });
      await producer.disconnect();
    }

    return {
      id: probe.id,
      protocol: 'kafka',
      status: 'verified_real',
      checkedAt,
      details: `Kafka accesible (${brokers.length} broker(s))`,
    };
  } catch (error) {
    return {
      id: probe.id,
      protocol: 'kafka',
      status: 'failed_real',
      checkedAt,
      details: error instanceof Error ? error.message : 'Error Kafka desconocido',
    };
  }
}

async function runCdcProbe(probe: Extract<ExtraProbe, { type: 'cdc' }>): Promise<ProbeResult> {
  const checkedAt = nowIso();

  if (!probe.url) {
    return {
      id: probe.id,
      protocol: 'cdc',
      status: probe.required ? 'failed_real' : 'skipped_missing_config',
      checkedAt,
      details: 'URL CDC no configurada',
    };
  }

  try {
    const response = await fetch(probe.url, { method: 'GET' });
    const text = await response.text();

    if (!response.ok) {
      return {
        id: probe.id,
        protocol: 'cdc',
        status: 'failed_real',
        checkedAt,
        details: `HTTP ${response.status}`,
      };
    }

    let payload: unknown = text;
    try {
      payload = JSON.parse(text);
    } catch {
      return {
        id: probe.id,
        protocol: 'cdc',
        status: 'verified_real',
        checkedAt,
        details: 'CDC endpoint respondió texto no JSON',
      };
    }

    if (probe.expectedConnectorState) {
      const actual = getByPath(payload, 'connector.state') ?? getByPath(payload, 'state');
      if (String(actual ?? '').toUpperCase() !== probe.expectedConnectorState.toUpperCase()) {
        return {
          id: probe.id,
          protocol: 'cdc',
          status: 'failed_real',
          checkedAt,
          details: `connector.state=${String(actual)} esperado=${probe.expectedConnectorState}`,
        };
      }
    }

    if (probe.expectedTaskState) {
      const tasks = getByPath(payload, 'tasks');
      if (Array.isArray(tasks)) {
        const invalid = tasks.find((task) => {
          const state = getByPath(task, 'state');
          return String(state ?? '').toUpperCase() !== probe.expectedTaskState.toUpperCase();
        });
        if (invalid) {
          return {
            id: probe.id,
            protocol: 'cdc',
            status: 'failed_real',
            checkedAt,
            details: `task.state inválido, esperado=${probe.expectedTaskState}`,
          };
        }
      }
    }

    return {
      id: probe.id,
      protocol: 'cdc',
      status: 'verified_real',
      checkedAt,
      details: 'CDC endpoint accesible y consistente',
    };
  } catch (error) {
    return {
      id: probe.id,
      protocol: 'cdc',
      status: 'failed_real',
      checkedAt,
      details: error instanceof Error ? error.message : 'Error CDC desconocido',
    };
  }
}

async function runWebhookProbe(probe: Extract<ExtraProbe, { type: 'webhook' }>): Promise<ProbeResult> {
  const checkedAt = nowIso();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(probe.headers ?? {}),
  };

  if (probe.authEnvVar) {
    const token = process.env[probe.authEnvVar];
    if (!token) {
      return {
        id: probe.id,
        protocol: 'webhook',
        status: probe.required ? 'failed_real' : 'skipped_missing_auth',
        checkedAt,
        details: `Falta variable ${probe.authEnvVar}`,
      };
    }
    headers[probe.authHeader ?? 'Authorization'] = token;
  }

  const bodyObj = probe.body ?? { ping: 'ok', source: 'verify-surface', timestamp: nowIso() };
  const bodyRaw = JSON.stringify(bodyObj);

  if (probe.hmacSecretEnvVar) {
    const secret = process.env[probe.hmacSecretEnvVar];
    if (!secret) {
      return {
        id: probe.id,
        protocol: 'webhook',
        status: probe.required ? 'failed_real' : 'skipped_missing_auth',
        checkedAt,
        details: `Falta variable ${probe.hmacSecretEnvVar}`,
      };
    }

    const digest = createHmac('sha256', secret).update(bodyRaw).digest('hex');
    const prefix = probe.signaturePrefix ?? 'sha256=';
    headers[probe.signatureHeader ?? 'X-Signature'] = `${prefix}${digest}`;
  }

  try {
    const response = await fetch(probe.url, {
      method: probe.method ?? 'POST',
      headers,
      body: bodyRaw,
    });

    const expectedStatus = probe.expectedStatus ?? 200;
    if (response.status !== expectedStatus) {
      return {
        id: probe.id,
        protocol: 'webhook',
        status: 'failed_real',
        checkedAt,
        details: `HTTP ${response.status}, esperado ${expectedStatus}`,
      };
    }

    return {
      id: probe.id,
      protocol: 'webhook',
      status: 'verified_real',
      checkedAt,
      details: 'Webhook respondió con status esperado',
    };
  } catch (error) {
    return {
      id: probe.id,
      protocol: 'webhook',
      status: 'failed_real',
      checkedAt,
      details: error instanceof Error ? error.message : 'Error webhook desconocido',
    };
  }
}

async function runRedisProbe(probe: Extract<ExtraProbe, { type: 'redis' }>): Promise<ProbeResult> {
  const checkedAt = nowIso();
  const envVar = probe.urlEnvVar ?? 'REDIS_URL';
  const url = process.env[envVar];

  if (!url) {
    return {
      id: probe.id,
      protocol: 'redis',
      status: probe.required ? 'failed_real' : 'skipped_missing_config',
      checkedAt,
      details: `Falta variable ${envVar}`,
    };
  }

  try {
    const RedisModule = await import('ioredis');
    const RedisCtor = (RedisModule.default ?? RedisModule.Redis) as new (uri: string) => {
      ping: () => Promise<string>;
      quit: () => Promise<string>;
    };

    const client = new RedisCtor(url);
    const pong = await client.ping();
    await client.quit();

    if (pong !== 'PONG') {
      return {
        id: probe.id,
        protocol: 'redis',
        status: 'failed_real',
        checkedAt,
        details: `PING devolvió ${pong}`,
      };
    }

    return {
      id: probe.id,
      protocol: 'redis',
      status: 'verified_real',
      checkedAt,
      details: 'Redis respondió PONG',
    };
  } catch (error) {
    return {
      id: probe.id,
      protocol: 'redis',
      status: 'failed_real',
      checkedAt,
      details: error instanceof Error ? error.message : 'Error Redis desconocido',
    };
  }
}

async function runSqlProbe(probe: Extract<ExtraProbe, { type: 'sql' }>): Promise<ProbeResult> {
  const checkedAt = nowIso();
  const connectionString = process.env[probe.connectionEnvVar];

  if (!connectionString) {
    return {
      id: probe.id,
      protocol: 'sql',
      status: 'skipped_missing_config',
      checkedAt,
      details: `Falta variable ${probe.connectionEnvVar}`,
    };
  }

  try {
    const pg = await import('pg');
    const client = new pg.Client({ connectionString });
    await client.connect();
    const result = await client.query(probe.query);
    await client.end();

    const minRows = probe.expectedMinRows ?? 0;
    if (result.rowCount < minRows) {
      return {
        id: probe.id,
        protocol: 'sql',
        status: 'failed_real',
        checkedAt,
        details: `rowCount=${result.rowCount}, esperado>=${minRows}`,
      };
    }

    return {
      id: probe.id,
      protocol: 'sql',
      status: 'verified_real',
      checkedAt,
      details: `SQL respondió ${result.rowCount} fila(s)`,
    };
  } catch (error) {
    return {
      id: probe.id,
      protocol: 'sql',
      status: 'failed_real',
      checkedAt,
      details: error instanceof Error ? error.message : 'Error SQL desconocido',
    };
  }
}

async function runHttpContractProbe(
  probe: Extract<ExtraProbe, { type: 'http-contract' }>,
): Promise<ProbeResult> {
  const checkedAt = nowIso();
  const contract = CONTRACT_MAP.get(probe.contractId);

  if (!contract) {
    return {
      id: probe.id,
      protocol: 'http-contract',
      status: 'failed_real',
      checkedAt,
      details: `Contrato no encontrado: ${probe.contractId}`,
    };
  }

  const authEnvVar = contract.auth?.envVar;
  if (authEnvVar && !process.env[authEnvVar]) {
    return {
      id: probe.id,
      protocol: 'http-contract',
      status: 'skipped_missing_auth',
      checkedAt,
      details: `Falta variable ${authEnvVar}`,
    };
  }

  try {
    const tester = createContractTester();
    const suite = await tester.runSuite(contract);
    return {
      id: probe.id,
      protocol: 'http-contract',
      status: suite.passed ? 'verified_real' : 'failed_real',
      checkedAt,
      details: suite.passed
        ? 'Contrato validado contra API real'
        : `Fallas ${suite.summary.failed}/${suite.summary.total}, violations=${suite.summary.violations}`,
      metadata: {
        connectorId: contract.connectorId,
        total: suite.summary.total,
        passed: suite.summary.passed,
        failed: suite.summary.failed,
        violations: suite.summary.violations,
      },
    };
  } catch (error) {
    return {
      id: probe.id,
      protocol: 'http-contract',
      status: 'failed_real',
      checkedAt,
      details: error instanceof Error ? error.message : 'Error desconocido',
    };
  }
}

async function main() {
  const defaultHttpProbes: ExtraProbe[] = ALL_CONTRACTS.map((contract) => ({
    type: 'http-contract',
    id: `http:${contract.connectorId}`,
    contractId: contract.connectorId,
  }));

  const extra = await parseExtraProbes();
  const infra = autoInfrastructureProbes();
  const probes = [...defaultHttpProbes, ...infra, ...extra];

  const results: ProbeResult[] = [];

  for (const probe of probes) {
    if (probe.type === 'http-contract') {
      results.push(await runHttpContractProbe(probe));
      continue;
    }
    if (probe.type === 'graphql') {
      results.push(await runGraphQlProbe(probe));
      continue;
    }
    if (probe.type === 'grpc') {
      results.push(await runGrpcProbe(probe));
      continue;
    }
    if (probe.type === 'sql') {
      results.push(await runSqlProbe(probe));
      continue;
    }
    if (probe.type === 'kafka') {
      results.push(await runKafkaProbe(probe));
      continue;
    }
    if (probe.type === 'cdc') {
      results.push(await runCdcProbe(probe));
      continue;
    }
    if (probe.type === 'webhook') {
      results.push(await runWebhookProbe(probe));
      continue;
    }
    if (probe.type === 'redis') {
      results.push(await runRedisProbe(probe));
      continue;
    }
  }

  const report: IntegrationSurfaceReport = {
    generatedAt: nowIso(),
    mode: 'multi-protocol-live',
    results,
  };

  await mkdir('.drift/reports', { recursive: true });
  const outPath = join('.drift/reports', `integration-surface-${Date.now()}.json`);
  await writeFile(outPath, JSON.stringify(report, null, 2), 'utf-8');

  console.log('\n[verify-integration-surface] Resultado');
  for (const result of results) {
    console.log(`- ${result.id}: ${result.status}`);
    if (result.details) console.log(`  -> ${result.details}`);
  }
  console.log(`\n[verify-integration-surface] Reporte: ${outPath}`);

  const failed = results.some((r) => r.status === 'failed_real');
  if (failed) process.exit(1);
}

main().catch((error) => {
  console.error('[verify-integration-surface] Fatal:', error);
  process.exit(1);
});
