import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createHmac } from 'node:crypto';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { ALL_CONTRACTS, CONTRACT_MAP } from '../contracts/ts/src/connector-contracts.ts';
import { createContractTester } from '../contracts/ts/src/contract-tester.ts';

export type ProbeStatus =
  | 'verified_real'
  | 'failed_real'
  | 'skipped_missing_auth'
  | 'skipped_missing_config'
  | 'skipped_missing_dependency';

export type ExtraProbe =
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

export interface ProbeResult {
  id: string;
  protocol: 'http-contract' | 'graphql' | 'grpc' | 'sql' | 'kafka' | 'cdc' | 'webhook' | 'redis';
  status: ProbeStatus;
  checkedAt: string;
  details?: string;
  metadata?: Record<string, unknown>;
  recommendations?: string[];
}

export interface IntegrationSurfaceReport {
  generatedAt: string;
  mode: 'multi-protocol-live';
  results: ProbeResult[];
}

export type ProbeType = ExtraProbe['type'];
export type ProbeRunner<T extends ProbeType> = (probe: Extract<ExtraProbe, { type: T }>) => Promise<ProbeResult>;
export type ProbeRunnerMap = {
  [K in ProbeType]: ProbeRunner<K>;
};

export interface RemediationDecision {
  recommendations: string[];
  signals: string[];
  matchedRuleIds: string[];
  source: 'structured' | 'hybrid' | 'fallback';
}

interface DecisionContext {
  result: ProbeResult;
  detailsLower: string;
  statusCode?: number;
  endpointId?: string;
  connectorId?: string;
  failureCode?: string;
  signals: Set<string>;
  structuredSignals: Set<string>;
}

interface DecisionRule {
  id: string;
  priority: number;
  when: {
    protocols?: ProbeResult['protocol'][];
    statuses?: ProbeStatus[];
    signalsAny?: string[];
    signalsAll?: string[];
  };
  actions: string[];
}

const DEFAULT_PROBE_TIMEOUT_MS = 15000;

function getProbeTimeoutMs(): number {
  const raw = Number(process.env.PROBE_TIMEOUT_MS ?? DEFAULT_PROBE_TIMEOUT_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_PROBE_TIMEOUT_MS;
}

function getProbeConcurrency(): number {
  const raw = Number(process.env.PROBE_CONCURRENCY ?? 4);
  if (!Number.isFinite(raw) || raw < 1) return 1;
  return Math.floor(raw);
}

async function fetchWithProbeTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), getProbeTimeoutMs());

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function parseProbeArray(raw: string): ExtraProbe[] {
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

export function getByPath(value: unknown, path: string): unknown {
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

function createDecisionContext(result: ProbeResult): DecisionContext {
  const detailsLower = String(result.details ?? '').toLowerCase();
  const statusCode = typeof result.metadata?.statusCode === 'number'
    ? result.metadata.statusCode
    : undefined;
  const endpointId = typeof result.metadata?.endpointId === 'string'
    ? result.metadata.endpointId
    : undefined;
  const connectorId = typeof result.metadata?.connectorId === 'string'
    ? result.metadata.connectorId
    : undefined;
  const failureCode = typeof result.metadata?.failureCode === 'string'
    ? result.metadata.failureCode
    : undefined;

  const signals = new Set<string>();
  const structuredSignals = new Set<string>();

  const failureCodeSignals = FAILURE_CODE_TO_SIGNALS[failureCode ?? ''] ?? [];
  for (const signal of failureCodeSignals) {
    signals.add(signal);
    structuredSignals.add(signal);
  }

  if (statusCode === 401 || statusCode === 403 || /\b401\b|\b403\b/.test(detailsLower)) {
    signals.add('auth_error');
    if (statusCode === 401 || statusCode === 403) {
      structuredSignals.add('auth_error');
    }
  }
  if (statusCode !== undefined && statusCode >= 500) {
    signals.add('remote_5xx');
    structuredSignals.add('remote_5xx');
  }
  if (typeof result.metadata?.violations === 'number' && result.metadata.violations > 0) {
    signals.add('contract_mismatch');
    structuredSignals.add('contract_mismatch');
  }
  if (typeof result.metadata?.failed === 'number' && result.metadata.failed > 0) {
    signals.add('contract_mismatch');
    structuredSignals.add('contract_mismatch');
  }
  if (/timeout|timed out|econnrefused|enotfound|network|fetch failed/.test(detailsLower)) {
    signals.add('network_error');
  }
  if (/no\s+json|respuesta\s+no\s+json|unexpected token\s*</.test(detailsLower)) {
    signals.add('format_error');
  }
  if (/missing|falta variable|not configured|no configurad/.test(detailsLower)) {
    signals.add('config_missing');
  }
  if (/schema|violation|contract|pattern/.test(detailsLower)) {
    signals.add('contract_mismatch');
  }

  return {
    result,
    detailsLower,
    statusCode,
    endpointId,
    connectorId,
    failureCode,
    signals,
    structuredSignals,
  };
}

const FAILURE_CODE_TO_SIGNALS: Record<string, string[]> = {
  AUTH_MISSING: ['config_missing', 'auth_error'],
  DEPENDENCY_MISSING: ['config_missing'],
  CONFIG_MISSING: ['config_missing'],
  NETWORK_ERROR: ['network_error'],
  GRPC_CALL_FAILED: ['network_error'],
  HTTP_STATUS_MISMATCH: ['remote_5xx'],
  GRAPHQL_ERRORS: ['contract_mismatch'],
  CONTRACT_VIOLATION: ['contract_mismatch'],
  CONTRACT_NOT_FOUND: ['contract_mismatch'],
  PARSE_ERROR: ['format_error'],
  TOPIC_NOT_FOUND: ['config_missing'],
  STATE_MISMATCH: ['contract_mismatch'],
  THRESHOLD_NOT_MET: ['contract_mismatch'],
  REDIS_PING_INVALID: ['contract_mismatch'],
};

function matchesRule(context: DecisionContext, rule: DecisionRule): boolean {
  const { protocols, statuses, signalsAny, signalsAll } = rule.when;

  if (protocols && !protocols.includes(context.result.protocol)) {
    return false;
  }
  if (statuses && !statuses.includes(context.result.status)) {
    return false;
  }
  if (signalsAny && !signalsAny.some((signal) => context.signals.has(signal))) {
    return false;
  }
  if (signalsAll && !signalsAll.every((signal) => context.signals.has(signal))) {
    return false;
  }

  return true;
}

function renderActionTemplate(template: string, context: DecisionContext): string {
  return template
    .replaceAll('{{endpointId}}', context.endpointId ?? 'desconocido')
    .replaceAll('{{connectorId}}', context.connectorId ?? 'desconocido');
}

const REMEDIATION_RULES: DecisionRule[] = [
  {
    id: 'auth-error',
    priority: 100,
    when: { statuses: ['failed_real'], signalsAny: ['auth_error'] },
    actions: ['Validar credenciales/tokens del servicio y permisos del recurso consultado'],
  },
  {
    id: 'remote-5xx',
    priority: 95,
    when: { statuses: ['failed_real'], signalsAny: ['remote_5xx'] },
    actions: ['Reintentar y validar disponibilidad temporal del proveedor o servicio destino'],
  },
  {
    id: 'network-error',
    priority: 90,
    when: { statuses: ['failed_real'], signalsAny: ['network_error'] },
    actions: ['Verificar conectividad de red, DNS, firewall y reachability del endpoint'],
  },
  {
    id: 'format-error',
    priority: 85,
    when: { statuses: ['failed_real'], signalsAny: ['format_error'] },
    actions: ['Validar que el endpoint devuelva el formato esperado y ajustar parser/headers si corresponde'],
  },
  {
    id: 'missing-config',
    priority: 80,
    when: { statuses: ['failed_real'], signalsAny: ['config_missing'] },
    actions: ['Completar variables de entorno requeridas y volver a ejecutar la verificación'],
  },
  {
    id: 'contract-mismatch',
    priority: 75,
    when: { statuses: ['failed_real'], signalsAny: ['contract_mismatch'] },
    actions: ['Comparar payload real vs contrato canónico y actualizar el contrato solo si el cambio es válido'],
  },
  {
    id: 'http-contract-review',
    priority: 70,
    when: { protocols: ['http-contract'], statuses: ['failed_real'] },
    actions: [
      'Revisar request/response real del endpoint {{endpointId}}',
      'Revisar contrato canónico, endpoint objetivo y payload real de la llamada fallida',
      'Re-ejecutar verify:surface luego de ajustar contrato o credenciales',
    ],
  },
  {
    id: 'cdc-baseline',
    priority: 60,
    when: { protocols: ['cdc'], statuses: ['failed_real'] },
    actions: [
      'Verificar disponibilidad de Debezium Connect y estado RUNNING de connector/tasks',
      'Revisar conectividad de red desde runner hacia DEBEZIUM_CONNECT_URL',
    ],
  },
  {
    id: 'kafka-baseline',
    priority: 60,
    when: { protocols: ['kafka'], statuses: ['failed_real'] },
    actions: ['Verificar brokers, SASL/SSL y existencia del topic de healthcheck'],
  },
  {
    id: 'webhook-baseline',
    priority: 60,
    when: { protocols: ['webhook'], statuses: ['failed_real'] },
    actions: ['Validar firma HMAC y expectedStatus del endpoint webhook'],
  },
  {
    id: 'sql-baseline',
    priority: 60,
    when: { protocols: ['sql'], statuses: ['failed_real'] },
    actions: ['Revisar connection string, permisos de usuario y query de health'],
  },
  {
    id: 'redis-baseline',
    priority: 60,
    when: { protocols: ['redis'], statuses: ['failed_real'] },
    actions: ['Validar REDIS_URL y conectividad desde el entorno de ejecución'],
  },
  {
    id: 'graphql-baseline',
    priority: 60,
    when: { protocols: ['graphql'], statuses: ['failed_real'] },
    actions: ['Revisar token GraphQL, schema vigente e introspección del endpoint'],
  },
  {
    id: 'grpc-baseline',
    priority: 60,
    when: { protocols: ['grpc'], statuses: ['failed_real'] },
    actions: ['Validar método gRPC, TLS/plaintext y disponibilidad de grpcurl'],
  },
  {
    id: 'generic-fallback',
    priority: 10,
    when: { statuses: ['failed_real'] },
    actions: ['Inspeccionar logs del servicio y volver a correr verify:surface con trazas habilitadas'],
  },
];

export function decideRemediation(result: ProbeResult): RemediationDecision {
  if (result.status !== 'failed_real') {
    return { recommendations: [], signals: [], matchedRuleIds: [], source: 'structured' };
  }

  const context = createDecisionContext(result);
  const sortedRules = [...REMEDIATION_RULES].sort((a, b) => b.priority - a.priority);
  const matchedRules = sortedRules.filter((rule) => matchesRule(context, rule));

  const recommendations = Array.from(new Set(
    matchedRules.flatMap((rule) => rule.actions.map((action) => renderActionTemplate(action, context))),
  ));

  const hasStructured = context.structuredSignals.size > 0;
  const hasRegexOnly = context.signals.size > context.structuredSignals.size;

  return {
    recommendations,
    signals: Array.from(context.signals),
    matchedRuleIds: matchedRules.map((rule) => rule.id),
    source: hasStructured ? (hasRegexOnly ? 'hybrid' : 'structured') : 'fallback',
  };
}

export function proposeRemediation(result: ProbeResult): string[] {
  return decideRemediation(result).recommendations;
}

export function autoInfrastructureProbes(): ExtraProbe[] {
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
      metadata: { failureCode: 'AUTH_MISSING' },
    };
  }

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (probe.authEnvVar) {
      headers[authHeader] = process.env[probe.authEnvVar] as string;
    }

    const response = await fetchWithProbeTimeout(probe.url, {
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
        metadata: { failureCode: 'PARSE_ERROR', statusCode: response.status },
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
        metadata: {
          failureCode: hasErrors ? 'GRAPHQL_ERRORS' : 'HTTP_STATUS_MISMATCH',
          statusCode: response.status,
        },
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
      metadata: { failureCode: 'NETWORK_ERROR' },
    };
  }
}

function runGrpcurl(args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolvePromise) => {
    const processRef = spawn('grpcurl', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    const timeoutMs = getProbeTimeoutMs();

    let stdout = '';
    let stderr = '';
    let settled = false;

    processRef.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    processRef.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      processRef.kill();
      resolvePromise({ code: 124, stdout, stderr: `grpcurl timeout after ${timeoutMs}ms` });
    }, timeoutMs);

    processRef.on('error', () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolvePromise({ code: 127, stdout, stderr: 'grpcurl no disponible en PATH' });
    });
    processRef.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
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
      metadata: { failureCode: 'AUTH_MISSING' },
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
      metadata: { failureCode: 'DEPENDENCY_MISSING' },
    };
  }

  if (result.code !== 0) {
    return {
      id: probe.id,
      protocol: 'grpc',
      status: 'failed_real',
      checkedAt,
      details: result.stderr || 'grpcurl falló',
      metadata: { failureCode: 'GRPC_CALL_FAILED' },
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
      metadata: { failureCode: 'CONFIG_MISSING' },
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
        metadata: { failureCode: 'TOPIC_NOT_FOUND' },
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
      metadata: { failureCode: 'NETWORK_ERROR' },
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
      metadata: { failureCode: 'CONFIG_MISSING' },
    };
  }

  try {
    const response = await fetchWithProbeTimeout(probe.url, { method: 'GET' });
    const text = await response.text();

    if (!response.ok) {
      return {
        id: probe.id,
        protocol: 'cdc',
        status: 'failed_real',
        checkedAt,
        details: `HTTP ${response.status}`,
        metadata: { failureCode: 'HTTP_STATUS_MISMATCH', statusCode: response.status },
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
          metadata: { failureCode: 'STATE_MISMATCH' },
        };
      }
    }

    if (probe.expectedTaskState) {
      const tasks = getByPath(payload, 'tasks');
      if (Array.isArray(tasks)) {
        const expectedTaskState = probe.expectedTaskState;
        const invalid = tasks.find((task) => {
          const state = getByPath(task, 'state');
          return String(state ?? '').toUpperCase() !== expectedTaskState.toUpperCase();
        });
        if (invalid) {
          return {
            id: probe.id,
            protocol: 'cdc',
            status: 'failed_real',
            checkedAt,
            details: `task.state inválido, esperado=${probe.expectedTaskState}`,
            metadata: { failureCode: 'STATE_MISMATCH' },
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
      metadata: { failureCode: 'NETWORK_ERROR' },
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
        metadata: { failureCode: 'AUTH_MISSING' },
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
        metadata: { failureCode: 'AUTH_MISSING' },
      };
    }

    const digest = createHmac('sha256', secret).update(bodyRaw).digest('hex');
    const prefix = probe.signaturePrefix ?? 'sha256=';
    headers[probe.signatureHeader ?? 'X-Signature'] = `${prefix}${digest}`;
  }

  try {
    const response = await fetchWithProbeTimeout(probe.url, {
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
        metadata: { failureCode: 'HTTP_STATUS_MISMATCH', statusCode: response.status },
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
      metadata: { failureCode: 'NETWORK_ERROR' },
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
      metadata: { failureCode: 'CONFIG_MISSING' },
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
        metadata: { failureCode: 'REDIS_PING_INVALID' },
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
      metadata: { failureCode: 'NETWORK_ERROR' },
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
      metadata: { failureCode: 'CONFIG_MISSING' },
    };
  }

  try {
    const pg = await import('pg');
    const client = new pg.Client({ connectionString });
    await client.connect();
    const result = await client.query(probe.query);
    await client.end();

    const minRows = probe.expectedMinRows ?? 0;
    const rowCount = result.rowCount ?? 0;
    if (rowCount < minRows) {
      return {
        id: probe.id,
        protocol: 'sql',
        status: 'failed_real',
        checkedAt,
        details: `rowCount=${rowCount}, esperado>=${minRows}`,
        metadata: { failureCode: 'THRESHOLD_NOT_MET' },
      };
    }

    return {
      id: probe.id,
      protocol: 'sql',
      status: 'verified_real',
      checkedAt,
      details: `SQL respondió ${rowCount} fila(s)`,
    };
  } catch (error) {
    return {
      id: probe.id,
      protocol: 'sql',
      status: 'failed_real',
      checkedAt,
      details: error instanceof Error ? error.message : 'Error SQL desconocido',
      metadata: { failureCode: 'NETWORK_ERROR' },
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
      metadata: { failureCode: 'CONTRACT_NOT_FOUND' },
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
      metadata: { failureCode: 'AUTH_MISSING' },
    };
  }

  try {
    const tester = createContractTester();
    const suite = await tester.runSuite(contract);
    const firstFailed = suite.results.find((r) => !r.passed);
    const statusCode = firstFailed?.statusCode;
    const endpointId = firstFailed?.endpointId;
    return {
      id: probe.id,
      protocol: 'http-contract',
      status: suite.passed ? 'verified_real' : 'failed_real',
      checkedAt,
      details: suite.passed
        ? 'Contrato validado contra API real'
        : `Fallas ${suite.summary.failed}/${suite.summary.total}, violations=${suite.summary.violations}`,
      metadata: {
        failureCode: suite.passed ? undefined : 'CONTRACT_VIOLATION',
        connectorId: contract.connectorId,
        total: suite.summary.total,
        passed: suite.summary.passed,
        failed: suite.summary.failed,
        violations: suite.summary.violations,
        endpointId,
        statusCode,
      },
    };
  } catch (error) {
    return {
      id: probe.id,
      protocol: 'http-contract',
      status: 'failed_real',
      checkedAt,
      details: error instanceof Error ? error.message : 'Error desconocido',
      metadata: { failureCode: 'NETWORK_ERROR' },
    };
  }
}

export function createProbeRunnerMap(): ProbeRunnerMap {
  return {
    'http-contract': runHttpContractProbe,
    graphql: runGraphQlProbe,
    grpc: runGrpcProbe,
    sql: runSqlProbe,
    kafka: runKafkaProbe,
    cdc: runCdcProbe,
    webhook: runWebhookProbe,
    redis: runRedisProbe,
  };
}

export async function runProbe(
  probe: ExtraProbe,
  runnerMap: ProbeRunnerMap = createProbeRunnerMap(),
): Promise<ProbeResult> {
  const runner = runnerMap[probe.type] as (typedProbe: ExtraProbe) => Promise<ProbeResult>;
  return runner(probe);
}

export async function runProbesWithConcurrency(
  probes: ExtraProbe[],
  runnerMap: ProbeRunnerMap,
  concurrency = getProbeConcurrency(),
): Promise<ProbeResult[]> {
  const safeConcurrency = Math.max(1, concurrency);
  const results: ProbeResult[] = new Array(probes.length);
  let nextIndex = 0;

  const worker = async () => {
    while (true) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      if (currentIndex >= probes.length) {
        return;
      }

      results[currentIndex] = await runProbe(probes[currentIndex], runnerMap);
    }
  };

  await Promise.all(Array.from({ length: Math.min(safeConcurrency, probes.length) }, () => worker()));
  return results;
}

export async function main() {
  const defaultHttpProbes: ExtraProbe[] = ALL_CONTRACTS.map((contract) => ({
    type: 'http-contract',
    id: `http:${contract.connectorId}`,
    contractId: contract.connectorId,
  }));

  const extra = await parseExtraProbes();
  const infra = autoInfrastructureProbes();
  const probes = [...defaultHttpProbes, ...infra, ...extra];
  const runnerMap = createProbeRunnerMap();
  const results = await runProbesWithConcurrency(probes, runnerMap);

  const report: IntegrationSurfaceReport = {
    generatedAt: nowIso(),
    mode: 'multi-protocol-live',
    results: results.map((result) => {
      const decision = decideRemediation(result);
      return {
        ...result,
        recommendations: decision.recommendations,
        metadata: {
          ...(result.metadata ?? {}),
          decisionSignals: decision.signals,
          decisionRules: decision.matchedRuleIds,
          decisionSource: decision.source,
        },
      };
    }),
  };

  const analysisGaps = report.results.filter(
    (result) => result.status === 'failed_real' && result.metadata?.decisionSource === 'fallback',
  );

  await mkdir('.drift/reports', { recursive: true });
  const outPath = join('.drift/reports', `integration-surface-${Date.now()}.json`);
  await writeFile(outPath, JSON.stringify(report, null, 2), 'utf-8');

  console.log('\n[verify-integration-surface] Resultado');
  for (const result of results) {
    console.log(`- ${result.id}: ${result.status}`);
    if (result.details) console.log(`  -> ${result.details}`);
  }
  console.log(`\n[verify-integration-surface] Reporte: ${outPath}`);

  if (analysisGaps.length > 0) {
    console.log('\n[verify-integration-surface] Gaps de análisis detectados (sin reglas estructuradas):');
    for (const gap of analysisGaps) {
      console.log(`- ${gap.id} (${gap.protocol})`);
    }
  }

  const failed = results.some((r) => r.status === 'failed_real');
  if (failed || analysisGaps.length > 0) process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error('[verify-integration-surface] Fatal:', error);
    process.exit(1);
  });
}
