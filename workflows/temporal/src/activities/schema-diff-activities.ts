/**
 * Schema Diff Activities - Temporal orchestration layer
 *
 * This file keeps orchestration concerns only:
 * - resolve effective samples (inline + reservoir)
 * - compute cache keys
 * - invoke the schema bridge
 * - delegate persistence to the repository layer
 */

import { Context } from '@temporalio/activity';
import type { BridgeReport } from '@integrax/schema-bridge';
import { Redis } from 'ioredis';
import { Pool } from 'pg';
import { createHash } from 'node:crypto';
import {
  countReservoirSamples,
  ensureConnectorVersion,
  getMemoryVersion,
  loadMappingMemoryEntries,
  loadReservoirSamples,
  persistDiffResultTransactional,
  upsertSampleReservoirEntries,
} from './schema-diff-repository.js';

export interface DiffResult {
  sourceSchemaId: string;
  targetSchemaId: string;
  workflowId?: string;
  hasDifferences: boolean;
  mismatches: {
    addedFields: string[];
    removedFields: string[];
    typeChanges: Array<{ path: string; fromType: string; toType: string }>;
    renameCandidates: Array<{ fromPath: string; toPath: string; similarityPct: number }>;
  };
  blueprint: BlueprintAction[];
  generatedTransformTs: string;
  requiresLLMFallback: boolean;
  llmEscalations: Array<{ path: string; reason: string; promptSeed: string }>;
  summary: BridgeReport['requirementsReport']['summary'];
  reportId: string;
  tenantId?: string;
  sourceFingerprint: string;
  targetFingerprint: string;
  fullSchemaA: any;
  fullSchemaB: any;
  sampleInventory?: {
    sourceInputCount: number;
    targetInputCount: number;
    sourceEffectiveCount: number;
    targetEffectiveCount: number;
    sourceReservoirCount: number;
    targetReservoirCount: number;
  };
}

export interface BlueprintAction {
  action: 'add' | 'remove' | 'rename' | 'cast' | 'restructure' | 'identity';
  path: string;
  fromPath?: string;
  toPath?: string;
  fromType?: string;
  toType?: string;
  coercionFn?: string;
  description: string;
}

export interface SchemaDiffInput {
  sourceSchemaId: string;
  targetSchemaId: string;
  samplesA?: Record<string, unknown>[];
  samplesB?: Record<string, unknown>[];
  tenantId?: string;
  options?: {
    renameSimilarityThreshold?: number;
    enableLlmEscalation?: boolean;
    useSampleReservoir?: boolean;
    sampleLimit?: number;
    forceRecalculate?: boolean;
    /** Máximo de entradas de memoria a cargar desde Postgres (default: 500). */
    memoryLimit?: number;
  };
}

export interface QueryableClient {
  query<T = any>(text: string, values?: unknown[]): Promise<{ rows: T[]; rowCount?: number }>;
  release?: () => void;
}

let redisClient: Redis | null = null;
let postgresPool: Pool | null = null;
const DEFAULT_RUNTIME_SAMPLE_LIMIT = 200;
const MAX_RUNTIME_SAMPLE_LIMIT = 2000;
const DEFAULT_RESERVOIR_LIMIT = 2000;

function sampleSetHash(samples: Record<string, unknown>[]): string {
  const sorted = samples.map(s => JSON.stringify(s)).sort().join('|');
  return createHash('sha256').update(sorted, 'utf8').digest('hex').slice(0, 12);
}

function getRedisClient(): Redis {
  if (!redisClient) {
    redisClient = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
  }
  return redisClient;
}

function getPgPool(): Pool {
  if (!postgresPool) {
    postgresPool = new Pool({
      connectionString: process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/integrax',
    });
  }
  return postgresPool;
}

function bridgeToDiffResult(
  report: BridgeReport,
  input: SchemaDiffInput,
  sampleInventory: DiffResult['sampleInventory'],
): DiffResult {
  const addedFields: string[] = [];
  const removedFields: string[] = [];
  const typeChanges: Array<{ path: string; fromType: string; toType: string }> = [];
  const renameCandidates: Array<{ fromPath: string; toPath: string; similarityPct: number }> = [];
  const blueprint: BlueprintAction[] = [];

  for (const diff of report.diffs) {
    switch (diff.kind) {
      case 'field_added':
        if (diff.pathB) addedFields.push(diff.pathB);
        blueprint.push({ action: 'add', path: diff.pathB!, description: `Nuevo campo en Sistema B: "${diff.pathB}"` });
        break;
      case 'field_removed':
        if (diff.pathA) removedFields.push(diff.pathA);
        blueprint.push({ action: 'remove', path: diff.pathA!, description: `Campo eliminado de Sistema B: "${diff.pathA}"` });
        break;
      case 'type_changed':
        if (diff.pathA && diff.nodeA && diff.nodeB) {
          const fromType = String(Array.isArray(diff.nodeA.type) ? diff.nodeA.type[0] : diff.nodeA.type);
          const toType = String(Array.isArray(diff.nodeB.type) ? diff.nodeB.type[0] : diff.nodeB.type);
          typeChanges.push({ path: diff.pathA, fromType, toType });
        }
        break;
      case 'rename_candidate':
        if (diff.pathA && diff.pathB && diff.similarity) {
          renameCandidates.push({
            fromPath: diff.pathA,
            toPath: diff.pathB,
            similarityPct: Math.round(diff.similarity.combined * 100),
          });
        }
        break;
    }
  }

  for (const mapping of report.mappings) {
    const { pathA, pathB, transform } = mapping;
    if (!pathA && !pathB) continue;

    const action: BlueprintAction['action'] =
      transform.kind === 'identity' ? 'identity' :
      transform.kind === 'rename' ? 'rename' :
      transform.kind === 'coerce_type' ? 'cast' :
      transform.kind === 'restructure' ? 'restructure' :
      'add';

    if (action === 'identity' || action === 'rename' || action === 'cast' || action === 'restructure') {
      blueprint.push({
        action,
        path: pathB ?? pathA ?? '',
        fromPath: pathA ?? undefined,
        toPath: pathB ?? undefined,
        coercionFn: transform.coercionFn,
        description: transform.description,
      });
    }
  }

  const llmEscalations = report.requirementsReport.llmEscalations.map(escalation => ({
    path: escalation.diff.pathA ?? escalation.diff.pathB ?? 'unknown',
    reason: escalation.reason,
    promptSeed: escalation.promptSeed,
  }));

  return {
    sourceSchemaId: input.sourceSchemaId,
    targetSchemaId: input.targetSchemaId,
    hasDifferences: report.diffs.length > 0,
    mismatches: { addedFields, removedFields, typeChanges, renameCandidates },
    blueprint,
    generatedTransformTs: report.generatedTransformTs,
    requiresLLMFallback: report.requirementsReport.summary.llmEscalationCount > 0,
    llmEscalations,
    summary: report.requirementsReport.summary,
    reportId: report.id,
    tenantId: input.tenantId,
    sourceFingerprint: report.inferredSchemaA.fingerprint,
    targetFingerprint: report.inferredSchemaB.fingerprint,
    fullSchemaA: report.inferredSchemaA,
    fullSchemaB: report.inferredSchemaB,
    sampleInventory,
  };
}

async function resolveSamples(
  client: QueryableClient,
  tenantId: string,
  schemaId: string,
  inlineSamples: Record<string, unknown>[] | undefined,
  useReservoir: boolean,
  sampleLimit: number,
  reservoirLimit: number,
): Promise<{ effective: Record<string, unknown>[]; reservoirCount: number }> {
  const directSamples = inlineSamples ?? [];

  if (directSamples.length > 0) {
    await upsertSampleReservoirEntries(client, tenantId, schemaId, directSamples, reservoirLimit);
  }

  const reservoirCount = await countReservoirSamples(client, tenantId, schemaId);
  const reservoirSamples = useReservoir || directSamples.length === 0
    ? await loadReservoirSamples(client, tenantId, schemaId, sampleLimit)
    : [];

  if (directSamples.length === 0) {
    return { effective: reservoirSamples, reservoirCount };
  }

  if (!useReservoir) {
    return { effective: directSamples.slice(0, sampleLimit), reservoirCount };
  }

  const unique = new Map<string, Record<string, unknown>>();
  for (const sample of [...directSamples, ...reservoirSamples]) {
    unique.set(JSON.stringify(sample), sample);
    if (unique.size >= sampleLimit) break;
  }

  return {
    effective: [...unique.values()],
    reservoirCount,
  };
}

export async function generateSchemaDiff(input: SchemaDiffInput): Promise<DiffResult> {
  const ctx = Context.current();
  const tenantId = input.tenantId || 'system';
  const sampleLimit = Math.max(1, Math.min(input.options?.sampleLimit ?? DEFAULT_RUNTIME_SAMPLE_LIMIT, MAX_RUNTIME_SAMPLE_LIMIT));
  const reservoirLimit = Math.max(sampleLimit, DEFAULT_RESERVOIR_LIMIT);
  const useSampleReservoir = input.options?.useSampleReservoir ?? true;
  const client = await getPgPool().connect();

  try {
    ctx.heartbeat({ stage: 'inferring_schemas' });

    const sourceSampleSet = await resolveSamples(
      client,
      tenantId,
      input.sourceSchemaId,
      input.samplesA,
      useSampleReservoir,
      sampleLimit,
      reservoirLimit,
    );
    const targetSampleSet = await resolveSamples(
      client,
      tenantId,
      input.targetSchemaId,
      input.samplesB,
      useSampleReservoir,
      sampleLimit,
      reservoirLimit,
    );

    if (sourceSampleSet.effective.length === 0 || targetSampleSet.effective.length === 0) {
      throw new Error('No hay suficientes muestras efectivas para comparar schemas. Cargá samples inline o llená el sample reservoir.');
    }

    const { createSchemaBridge, SchemaInferrer } = await import('@integrax/schema-bridge');
    const inferrer = new SchemaInferrer({ maxExamples: sampleLimit });
    const schemaA = inferrer.infer(sourceSampleSet.effective);
    const schemaB = inferrer.infer(targetSampleSet.effective);
    // v5: include memory version so operator feedback invalidates cached results.
    // getMemoryVersion is a single O(1) indexed query — much cheaper than loading
    // all memory rows just to decide whether to use the cache.
    const valHash = `${sampleSetHash(sourceSampleSet.effective)}:${sampleSetHash(targetSampleSet.effective)}`;
    ctx.heartbeat({ stage: 'checking_memory_version' });
    const memoryVersion = await getMemoryVersion(client, tenantId, input.sourceSchemaId, input.targetSchemaId);
    const cacheKey = `integrax:schemadiff:v5:${schemaA.fingerprint}:${schemaB.fingerprint}:${valHash}:mem${memoryVersion}`;

    const sampleInventory: DiffResult['sampleInventory'] = {
      sourceInputCount: input.samplesA?.length ?? 0,
      targetInputCount: input.samplesB?.length ?? 0,
      sourceEffectiveCount: sourceSampleSet.effective.length,
      targetEffectiveCount: targetSampleSet.effective.length,
      sourceReservoirCount: sourceSampleSet.reservoirCount,
      targetReservoirCount: targetSampleSet.reservoirCount,
    };

    if (!input.options?.forceRecalculate) {
      ctx.heartbeat({ stage: 'checking_cache' });
      try {
        const cached = await getRedisClient().get(cacheKey);
        if (cached) {
          ctx.log.info(`Cache HIT for ${schemaA.fingerprint} -> ${schemaB.fingerprint} mem=${memoryVersion}`);
          return JSON.parse(cached) as DiffResult;
        }
      } catch (error) {
        ctx.log.warn(`Error reading Redis cache key ${cacheKey}`, { error });
      }
    }

    ctx.heartbeat({ stage: 'loading_mapping_memory' });
    const mappingMemory = await loadMappingMemoryEntries(
      client,
      tenantId,
      input.sourceSchemaId,
      input.targetSchemaId,
      input.options?.memoryLimit,
    );

    ctx.heartbeat({ stage: 'comparing_in_engine' });
    const bridge = createSchemaBridge({
      redisUrl: process.env.REDIS_URL,
      anthropicApiKey: process.env.ANTHROPIC_API_KEY,
      maxExamples: sampleLimit,
      mappingMemory,
    });

    const report = await bridge.compare({
      connectorAId: input.sourceSchemaId,
      connectorBId: input.targetSchemaId,
      samplesA: sourceSampleSet.effective,
      samplesB: targetSampleSet.effective,
      tenantId: input.tenantId,
      options: {
        renameSimilarityThreshold: input.options?.renameSimilarityThreshold ?? 0.70,
        enableLlmEscalation: input.options?.enableLlmEscalation ?? false,
        maxLlmEscalations: 3,
      },
    });

    const diffResult = bridgeToDiffResult(report, input, sampleInventory);

    try {
      ctx.heartbeat({ stage: 'saving_cache' });
      await getRedisClient().setex(cacheKey, 2592000, JSON.stringify(diffResult));
    } catch (error) {
      ctx.log.warn(`Error writing Redis cache key ${cacheKey}`, { error });
    }

    ctx.heartbeat({ stage: 'done', reportId: report.id });
    return diffResult;
  } finally {
    client.release();
  }
}

export async function persistDiffResult(result: DiffResult): Promise<void> {
  const ctx = Context.current();
  const tenantId = result.tenantId || 'system';

  ctx.log.info(`Persisting report ${result.reportId} in Postgres`, {
    source: result.sourceSchemaId,
    target: result.targetSchemaId,
    tenantId,
    workflowId: result.workflowId,
  });

  const client = await getPgPool().connect();
  try {
    await persistDiffResultTransactional(client, result, tenantId);
    ctx.log.info(`Report ${result.reportId} persisted successfully.`);
  } catch (error) {
    ctx.log.error(`Error persisting report ${result.reportId} in Postgres`, { error });
    throw error;
  } finally {
    client.release();
  }
}

export { ensureConnectorVersion, persistDiffResultTransactional };
