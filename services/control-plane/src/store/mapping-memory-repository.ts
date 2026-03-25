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

// ─── Cache ────────────────────────────────────────────────────────────────────

const CACHE_TTL_MS = 60_000;
const CACHE_MAX_ENTRIES = 500; // evitar memory leak en instancias de larga vida

interface CacheEntry {
  entries: MappingMemoryEntry[];
  cachedAt: number;
}

// Map mantiene orden de inserción — usamos eso para LRU simple:
// al hacer get, delete + re-set mueve la clave al final (más reciente).
const cache = new Map<string, CacheEntry>();

function cacheKey(tenantId: string, connectorAId: string, connectorBId: string): string {
  return `${tenantId}:${connectorAId}:${connectorBId}`;
}

function cacheSet(key: string, entry: CacheEntry): void {
  cache.delete(key); // mueve al final si ya existe
  cache.set(key, entry);
  // Evict el más antiguo (primer elemento) si superamos el límite
  if (cache.size > CACHE_MAX_ENTRIES) {
    cache.delete(cache.keys().next().value!);
  }
}

function invalidate(tenantId: string, connectorAId: string, connectorBId: string): void {
  cache.delete(cacheKey(tenantId, connectorAId, connectorBId));
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
  const cached = cache.get(key);
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
    return cached.entries;
  }

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
  cacheSet(key, { entries, cachedAt: Date.now() });
  return entries;
}

/**
 * Persiste un único feedback (accept/reject) de forma atómica.
 *
 * En conflicto (el par ya existe), actualiza contadores y recomputa la media
 * ponderada acumulada directamente en SQL, evitando race conditions.
 * Invalida la cache del par afectado.
 */
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

  invalidate(tenantId, connectorAId, connectorBId);
}
