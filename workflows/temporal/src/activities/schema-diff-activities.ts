/**
 * Schema Diff Activities — Temporal
 *
 * Wrappea el motor @integrax/schema-bridge como Temporal Activity.
 * Toda la lógica determinística (inferencia, diff, similitud, resolución)
 * vive en el paquete schema-bridge. Esta activity solo orquesta la llamada
 * y traduce el resultado al contrato DiffResult existente.
 */

import { Context } from '@temporalio/activity';
import type { BridgeReport } from '@integrax/schema-bridge';
import { Redis } from 'ioredis';
import { Pool } from 'pg';

// ─── Contrato público (compatible con ID-0001 + enriquecido por ID-0002) ──────

export interface DiffResult {
  sourceSchemaId: string;
  targetSchemaId: string;
  hasDifferences: boolean;
  mismatches: {
    addedFields: string[];
    removedFields: string[];
    typeChanges: Array<{ path: string; fromType: string; toType: string }>;
    renameCandidates: Array<{ fromPath: string; toPath: string; similarityPct: number }>;
  };
  /** Reglas de transformación listas para ejecutar (A → B) */
  blueprint: BlueprintAction[];
  /** Código TypeScript generado para la transformación A→B */
  generatedTransformTs: string;
  /** true si quedaron conflictos incompatibles que el LLM debe resolver */
  requiresLLMFallback: boolean;
  /** IDs de los conflictos que necesitan LLM, con el prompt sugerido */
  llmEscalations: Array<{ path: string; reason: string; promptSeed: string }>;
  /** Resumen ejecutivo */
  summary: BridgeReport['requirementsReport']['summary'];
  reportId: string;
  // --- Versioning data ---
  tenantId?: string;
  sourceFingerprint: string;
  targetFingerprint: string;
  fullSchemaA: any;
  fullSchemaB: any;
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
  /** ID del sistema A (conector fuente) */
  sourceSchemaId: string;
  /** ID del sistema B (conector destino) */
  targetSchemaId: string;
  /** Muestras reales de datos del sistema A */
  samplesA: Record<string, unknown>[];
  /** Muestras reales de datos del sistema B */
  samplesB: Record<string, unknown>[];
  tenantId?: string;
  options?: {
    renameSimilarityThreshold?: number;
    enableLlmEscalation?: boolean;
  };
}

export interface QueryableClient {
  query<T = any>(text: string, values?: unknown[]): Promise<{ rows: T[]; rowCount?: number }>;
  release?: () => void;
}

// ─── Traducción BridgeReport → DiffResult ────────────────────────────────────

function bridgeToDiffResult(report: BridgeReport, input: SchemaDiffInput): DiffResult {
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

  // Construir blueprint desde los mappings generados
  for (const mapping of report.mappings) {
    const { pathA, pathB, transform } = mapping;
    if (!pathA && !pathB) continue;

    const action: BlueprintAction['action'] =
      transform.kind === 'identity' ? 'identity' :
      transform.kind === 'rename' ? 'rename' :
      transform.kind === 'coerce_type' ? 'cast' :
      transform.kind === 'restructure' ? 'restructure' : 'add';

    // Evitar duplicados con los add/remove ya registrados
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

  const llmEscalations = report.requirementsReport.llmEscalations.map(e => ({
    path: e.diff.pathA ?? e.diff.pathB ?? 'unknown',
    reason: e.reason,
    promptSeed: e.promptSeed,
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
  };
}

// ─── Temporal Activity ────────────────────────────────────────────────────────

let redisClient: Redis | null = null;
let postgresPool: Pool | null = null;

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

/**
 * Activity de Temporal que ejecuta el motor de comparación de schemas.
 * Implementa caché en Redis usando el fingerprint inferido de las muestras.
 */
export async function generateSchemaDiff(input: SchemaDiffInput & { options?: { forceRecalculate?: boolean } }): Promise<DiffResult> {
  const ctx = Context.current();

  // Heartbeat inicial
  ctx.heartbeat({ stage: 'inferring_schemas' });

  // 1. Inferir schemas para obtener los fingerprints usados como Cache Key
  const { createSchemaBridge, SchemaInferrer } = await import('@integrax/schema-bridge');
  const inferrer = new SchemaInferrer();
  
  const schemaA = inferrer.infer(input.samplesA);
  const schemaB = inferrer.infer(input.samplesB);
  
  const cacheKey = `integrax:schemadiff:v2:${schemaA.fingerprint}:${schemaB.fingerprint}`;

  // 2. Verificar caché en Redis (Omitir si forceRecalculate = true)
  if (!input.options?.forceRecalculate) {
    ctx.heartbeat({ stage: 'checking_cache' });
    try {
      const cached = await getRedisClient().get(cacheKey);
      if (cached) {
        ctx.log.info(`✅ Cache HIT para fingerprints ${schemaA.fingerprint} y ${schemaB.fingerprint}`);
        return JSON.parse(cached) as DiffResult;
      }
    } catch (error) {
      ctx.log.warn(`⚠️ Error leyendo de Redis el key ${cacheKey}`, { error });
    }
  }

  // 3. Si no hay hit, generar reporte ejecutando el pipeline completo
  ctx.log.info(`❌ Cache MISS. Ejecutando SchemaBridge engine para ${schemaA.fingerprint} y ${schemaB.fingerprint}`);
  ctx.heartbeat({ stage: 'comparing_in_engine' });

  const bridge = createSchemaBridge({
    redisUrl: process.env.REDIS_URL,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  });

  const report = await bridge.compare({
    connectorAId: input.sourceSchemaId,
    connectorBId: input.targetSchemaId,
    samplesA: input.samplesA,
    samplesB: input.samplesB,
    tenantId: input.tenantId,
    options: {
      renameSimilarityThreshold: input.options?.renameSimilarityThreshold ?? 0.70,
      enableLlmEscalation: input.options?.enableLlmEscalation ?? false,
      maxLlmEscalations: 3,
    },
  });

  const diffResult = bridgeToDiffResult(report, input);

  // 4. Guardar en Caché por 30 días
  try {
    ctx.heartbeat({ stage: 'saving_cache' });
    // Guardamos 30 días (30 * 24 * 60 * 60)
    await getRedisClient().setex(cacheKey, 2592000, JSON.stringify(diffResult));
  } catch (error) {
    ctx.log.warn(`⚠️ Error guardando en Redis el key ${cacheKey}`, { error });
  }

  ctx.heartbeat({ stage: 'done', reportId: report.id });
  return diffResult;
}

/**
 * Persiste el reporte de diferencias en la base de datos (Postgres).
 * Sirve como un Audit Trail inmutable de los cambios de versión.
 */
export async function persistDiffResult(result: DiffResult): Promise<void> {
  const ctx = Context.current();
  const tenantId = result.tenantId || 'system';

  ctx.log.info(`Guardando reporte ${result.reportId} y gestionando versiones en Postgres`, {
    source: result.sourceSchemaId,
    target: result.targetSchemaId,
    tenantId
  });

  const client = await getPgPool().connect();
  try {
    await persistDiffResultTransactional(client, result, tenantId);
    ctx.log.info(`✅ Reporte ${result.reportId} y versiones procesadas exitosamente.`);
  } catch (error) {
    ctx.log.error(`❌ Error al persistir el reporte ${result.reportId} en Postgres`, { error });
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Lógica interna para decidir si se crea una nueva versión de un conector.
 * Si el fingerprint cambió respecto a la última versión, incrementa version_number.
 */
export async function persistDiffResultTransactional(
  client: QueryableClient,
  result: DiffResult,
  tenantId = result.tenantId || 'system',
): Promise<void> {
  await client.query('BEGIN');

  try {
    await upsertSchemaInventory(client, result.sourceFingerprint, result.fullSchemaA);
    await upsertSchemaInventory(client, result.targetFingerprint, result.fullSchemaB);

    await ensureConnectorVersion(client, result.sourceSchemaId, tenantId, result.sourceFingerprint, result.reportId);
    await ensureConnectorVersion(client, result.targetSchemaId, tenantId, result.targetFingerprint, result.reportId);

    await upsertSchemaDiffReport(client, result, tenantId);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

async function upsertSchemaInventory(client: QueryableClient, fingerprint: string, definition: unknown): Promise<void> {
  await client.query(`
    INSERT INTO schema_inventory (fingerprint, schema_definition)
    VALUES ($1, $2)
    ON CONFLICT (fingerprint) DO NOTHING
  `, [fingerprint, JSON.stringify(definition)]);
}

async function upsertSchemaDiffReport(client: QueryableClient, result: DiffResult, tenantId: string): Promise<void> {
  await client.query(`
    INSERT INTO schema_diff_reports (
      id, tenant_id, source_connector_id, target_connector_id,
      source_fingerprint, target_fingerprint, has_differences, diff_payload, created_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, NOW()
    )
    ON CONFLICT (id) DO UPDATE SET
      diff_payload = EXCLUDED.diff_payload,
      has_differences = EXCLUDED.has_differences,
      source_fingerprint = EXCLUDED.source_fingerprint,
      target_fingerprint = EXCLUDED.target_fingerprint
  `, [
    result.reportId,
    tenantId,
    result.sourceSchemaId,
    result.targetSchemaId,
    result.sourceFingerprint,
    result.targetFingerprint,
    result.hasDifferences,
    JSON.stringify(result),
  ]);
}

export async function ensureConnectorVersion(
  client: QueryableClient,
  connectorId: string,
  tenantId: string,
  fingerprint: string,
  reportId: string,
): Promise<void> {
  const lastVersionRes = await client.query(`
    SELECT fingerprint, version_number 
    FROM connector_schema_versions 
    WHERE connector_id = $1 AND tenant_id = $2 
    ORDER BY version_number DESC
    LIMIT 1
    FOR UPDATE
  `, [connectorId, tenantId]);

  if (lastVersionRes.rows.length === 0) {
    await client.query(`
      INSERT INTO connector_schema_versions (connector_id, tenant_id, fingerprint, version_number, metadata)
      VALUES ($1, $2, $3, 1, $4)
    `, [connectorId, tenantId, fingerprint, JSON.stringify({
      source: 'auto-discovery',
      report_id: reportId,
      first_seen: new Date().toISOString(),
    })]);
    return;
  }

  if (lastVersionRes.rows[0].fingerprint !== fingerprint) {
    const newVersion = lastVersionRes.rows[0].version_number + 1;
    await client.query(`
      INSERT INTO connector_schema_versions (connector_id, tenant_id, fingerprint, version_number, metadata)
      VALUES ($1, $2, $3, $4, $5)
    `, [connectorId, tenantId, fingerprint, newVersion, JSON.stringify({
      source: 'auto-discovery',
      report_id: reportId,
      detected_at: new Date().toISOString(),
      previous_fingerprint: lastVersionRes.rows[0].fingerprint,
    })]);
  }
}
