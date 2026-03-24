/**
 * Schema Diff Activities — Temporal
 *
 * Wrappea el motor @integrax/schema-bridge como Temporal Activity.
 * Toda la lógica determinística (inferencia, diff, similitud, resolución)
 * vive en el paquete schema-bridge. Esta activity solo orquesta la llamada
 * y traduce el resultado al contrato DiffResult existente.
 */

import { Context } from '@temporalio/activity';
import type { BridgeReport, FieldMapping } from '@integrax/schema-bridge';
import { Redis } from 'ioredis';

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
  };
}

// ─── Temporal Activity ────────────────────────────────────────────────────────

// Instancia global de redis - reutilizable entre invocaciones
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

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
  
  const cacheKey = `integrax:schemadiff:v1:${schemaA.fingerprint}:${schemaB.fingerprint}`;

  // 2. Verificar caché en Redis (Omitir si forceRecalculate = true)
  if (!input.options?.forceRecalculate) {
    ctx.heartbeat({ stage: 'checking_cache' });
    try {
      const cached = await redis.get(cacheKey);
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
    await redis.setex(cacheKey, 2592000, JSON.stringify(diffResult));
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
  ctx.log.info(`Guardando reporte ${result.reportId} en Postgres (Mock)`, {
    mismatchesCount: result.mismatches.addedFields.length + result.mismatches.removedFields.length,
    renameCandidates: result.mismatches.renameCandidates.length
  });

  // TODO: Implementar la inserción real con TypeORM o Prisma
  await new Promise(resolve => setTimeout(resolve, 500));
}
