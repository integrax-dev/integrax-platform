/**
 * Mapping Memory Repository
 *
 * Persistencia de la memoria de feedback operativo del schema-bridge.
 * Cada vez que un operador acepta o rechaza un mapeo, se llama a `upsertEntry`.
 * El módulo mantiene una cache TTL por tenant para no ir a Postgres en cada compare.
 *
 * Diseño:
 * - La tabla `schema_mapping_memory` indexa por (tenant_id, source_connector_id,
 *   target_connector_id, source_path, target_path) con UNIQUE constraint.
 * - El UPDATE en conflicto recomputa la media ponderada acumulada directamente
 *   en SQL, lo que hace el upsert atómico incluso con múltiples réplicas.
 * - Cache in-process: 60 s TTL por clave (tenantId:connectorAId:connectorBId).
 *   Se invalida al escribir. En multi-réplica, réplicas distintas pueden tener
 *   estados obsoletos hasta el siguiente TTL — aceptable para este caso de uso.
 */

import type { MappingMemoryEntry } from '@integrax/schema-bridge';
import { pool } from './db.js';
import { MemoryCacheAdapter } from './cache-adapter.js';
import type { ICacheAdapter } from './cache-adapter.js';

// ─── Cache ────────────────────────────────────────────────────────────────────

const CACHE_TTL_MS = 60_000;

/**
 * Adapter de cache activo. Para multi-réplica, reemplazar por RedisCacheAdapter.
 * Se exporta para permitir su swap en tests o en el bootstrap del servidor.
 */
export let cacheAdapter: ICacheAdapter<MappingMemoryEntry[]> = new MemoryCacheAdapter({ maxEntries: 500 });

/** Permite inyectar un adapter diferente (ej: Redis en producción multi-réplica). */
export function setCacheAdapter(adapter: ICacheAdapter<MappingMemoryEntry[]>): void {
  cacheAdapter = adapter;
}

function cacheKey(tenantId: string, connectorAId: string, connectorBId: string): string {
  return `${tenantId}:${connectorAId}:${connectorBId}`;
}

async function invalidate(tenantId: string, connectorAId: string, connectorBId: string): Promise<void> {
  await cacheAdapter.delete(cacheKey(tenantId, connectorAId, connectorBId));
}

// ─── DB row → MappingMemoryEntry ──────────────────────────────────────────────

interface MemoryRow {
  source_connector_id: string;
  target_connector_id: string;
  source_path: string;
  target_path: string;
  accepted_count: number;
  rejected_count: number;
  average_confidence: number;
  last_accepted_at: Date | null;
}

function rowToEntry(row: MemoryRow): MappingMemoryEntry {
  return {
    connectorAId: row.source_connector_id,
    connectorBId: row.target_connector_id,
    sourcePath: row.source_path,
    targetPath: row.target_path,
    acceptedCount: Number(row.accepted_count),
    rejectedCount: Number(row.rejected_count),
    averageConfidence: Number(row.average_confidence),
    lastAcceptedAt: row.last_accepted_at ? row.last_accepted_at.toISOString() : undefined,
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Carga todas las entradas de memoria para un par de conectores.
 * Usa cache TTL de 60 s. Una vez vencido, recarga desde Postgres.
 */
export async function loadMappingMemory(
  tenantId: string,
  connectorAId: string,
  connectorBId: string,
): Promise<MappingMemoryEntry[]> {
  const key = cacheKey(tenantId, connectorAId, connectorBId);
  const cached = await cacheAdapter.get(key);
  if (cached) return cached;

  const result = await pool.query<MemoryRow>(
    `SELECT source_connector_id, target_connector_id,
            source_path, target_path,
            accepted_count, rejected_count,
            average_confidence, last_accepted_at
     FROM schema_mapping_memory
     WHERE tenant_id = $1
       AND source_connector_id = $2
       AND target_connector_id = $3
     ORDER BY accepted_count + rejected_count DESC`,
    [tenantId, connectorAId, connectorBId],
  );

  const entries = result.rows.map(rowToEntry);
  await cacheAdapter.set(key, entries, CACHE_TTL_MS);
  return entries;
}

/**
 * Persiste un único feedback (accept/reject) de forma atómica.
 *
 * En conflicto (el par ya existe), actualiza contadores y recomputa la media
 * ponderada acumulada directamente en SQL, evitando race conditions.
 * Invalida la cache del par afectado.
 */
/**
 * Elimina entradas de memoria obsoletas o de baja calidad.
 *
 * Criterios de eliminación (OR):
 *   1. No actualizada en más de `maxAgeDays` días (default: 180)
 *   2. Ratio de rechazo ≥ `maxRejectionRatio` con al menos 3 muestras (default: 0.90)
 *
 * Devuelve el número de filas eliminadas.
 * Invalida la cache completa del tenant afectado.
 */
export async function pruneMemory(
  tenantId: string,
  opts: { maxAgeDays?: number; maxRejectionRatio?: number } = {},
): Promise<number> {
  const maxAgeDays = opts.maxAgeDays ?? 180;
  const maxRejectionRatio = opts.maxRejectionRatio ?? 0.90;

  const result = await pool.query<{ count: string }>(
    `WITH deleted AS (
       DELETE FROM schema_mapping_memory
       WHERE tenant_id = $1
         AND (
           updated_at < NOW() - ($2 || ' days')::INTERVAL
           OR (
             accepted_count + rejected_count >= 3
             AND rejected_count::float / NULLIF(accepted_count + rejected_count, 0) >= $3
           )
         )
       RETURNING source_connector_id, target_connector_id
     )
     SELECT COUNT(*)::text AS count FROM deleted`,
    [tenantId, maxAgeDays, maxRejectionRatio],
  );

  // Invalidar toda la cache del tenant (todas las claves que empiezan con tenantId:)
  await cacheAdapter.deleteByPrefix(`${tenantId}:`);

  return parseInt(result.rows[0]?.count ?? '0', 10);
}

export async function upsertEntry(
  tenantId: string,
  connectorAId: string,
  connectorBId: string,
  sourcePath: string,
  targetPath: string,
  accepted: boolean,
  confidence: number,
): Promise<void> {
  const acceptedDelta = accepted ? 1 : 0;
  const rejectedDelta = accepted ? 0 : 1;
  const lastAcceptedAt = accepted ? new Date() : null;

  await pool.query(
    `INSERT INTO schema_mapping_memory
       (tenant_id, source_connector_id, target_connector_id,
        source_path, target_path,
        accepted_count, rejected_count, average_confidence,
        last_accepted_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
     ON CONFLICT (tenant_id, source_connector_id, target_connector_id, source_path, target_path)
     DO UPDATE SET
       accepted_count    = schema_mapping_memory.accepted_count + $6,
       rejected_count    = schema_mapping_memory.rejected_count + $7,
       -- Media ponderada acumulada: (prev_avg * prev_total + new_confidence) / (prev_total + 1)
       average_confidence = (
         schema_mapping_memory.average_confidence
         * (schema_mapping_memory.accepted_count + schema_mapping_memory.rejected_count)
         + $8
       ) / (schema_mapping_memory.accepted_count + schema_mapping_memory.rejected_count + 1),
       last_accepted_at  = CASE
         WHEN $9 IS NOT NULL THEN $9
         ELSE schema_mapping_memory.last_accepted_at
       END,
       updated_at        = NOW()`,
    [
      tenantId, connectorAId, connectorBId,
      sourcePath, targetPath,
      acceptedDelta, rejectedDelta, confidence,
      lastAcceptedAt,
    ],
  );

  await invalidate(tenantId, connectorAId, connectorBId);
}

