import { createHash } from 'node:crypto';
import type { MappingMemoryEntry } from '@integrax/schema-bridge';
import type { QueryableClient } from './schema-diff-activities.js';

type PersistableDiffResult = {
  reportId: string;
  workflowId?: string;
  tenantId?: string;
  sourceSchemaId: string;
  targetSchemaId: string;
  sourceFingerprint: string;
  targetFingerprint: string;
  fullSchemaA: unknown;
  fullSchemaB: unknown;
  hasDifferences: boolean;
  blueprint: Array<{ action: string; fromPath?: string; toPath?: string }>;
  mismatches: {
    renameCandidates: Array<{ fromPath: string; toPath: string; similarityPct: number }>;
  };
};

function canonicalize(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;

  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, nested]) => `${JSON.stringify(key)}:${canonicalize(nested)}`);

  return `{${entries.join(',')}}`;
}

function sampleHash(sample: Record<string, unknown>): string {
  return createHash('sha256')
    .update(canonicalize(sample), 'utf8')
    .digest('hex')
    .slice(0, 32);
}

export async function upsertSchemaInventory(
  client: QueryableClient,
  fingerprint: string,
  definition: unknown,
): Promise<void> {
  await client.query(`
    INSERT INTO schema_inventory (fingerprint, schema_definition)
    VALUES ($1, $2)
    ON CONFLICT (fingerprint) DO NOTHING
  `, [fingerprint, JSON.stringify(definition)]);
}

export async function upsertSchemaDiffReport(
  client: QueryableClient,
  result: PersistableDiffResult,
  tenantId: string,
): Promise<void> {
  await client.query(`
    INSERT INTO schema_diff_reports (
      id, workflow_id, tenant_id, source_connector_id, target_connector_id,
      source_fingerprint, target_fingerprint, has_differences, diff_payload, created_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, NOW()
    )
    ON CONFLICT (id) DO UPDATE SET
      workflow_id = EXCLUDED.workflow_id,
      diff_payload = EXCLUDED.diff_payload,
      has_differences = EXCLUDED.has_differences,
      source_fingerprint = EXCLUDED.source_fingerprint,
      target_fingerprint = EXCLUDED.target_fingerprint
  `, [
    result.reportId,
    result.workflowId ?? null,
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

export async function loadReservoirSamples(
  client: QueryableClient,
  tenantId: string,
  schemaId: string,
  limit = 2000,
): Promise<Record<string, unknown>[]> {
  const result = await client.query<{ sample_payload: Record<string, unknown> }>(`
    SELECT sample_payload
    FROM schema_sample_reservoir
    WHERE tenant_id = $1
      AND schema_id = $2
      AND captured_at > NOW() - INTERVAL '90 days'
    ORDER BY captured_at DESC
    LIMIT $3
  `, [tenantId, schemaId, limit]);

  return result.rows.map(row => row.sample_payload);
}

export async function countReservoirSamples(
  client: QueryableClient,
  tenantId: string,
  schemaId: string,
): Promise<number> {
  const result = await client.query<{ count: string }>(`
    SELECT COUNT(*) AS count
    FROM schema_sample_reservoir
    WHERE tenant_id = $1 AND schema_id = $2
  `, [tenantId, schemaId]);

  return Number(result.rows[0]?.count ?? 0);
}

export async function upsertSampleReservoirEntries(
  client: QueryableClient,
  tenantId: string,
  schemaId: string,
  samples: Record<string, unknown>[],
  maxSamples = 2000,
): Promise<void> {
  const uniqueSamples = new Map<string, Record<string, unknown>>();
  for (const sample of samples) {
    uniqueSamples.set(sampleHash(sample), sample);
  }

  for (const [hash, sample] of uniqueSamples) {
    await client.query(`
      INSERT INTO schema_sample_reservoir (tenant_id, schema_id, sample_hash, sample_payload, captured_at)
      VALUES ($1, $2, $3, $4, NOW())
      ON CONFLICT (tenant_id, schema_id, sample_hash) DO UPDATE SET
        sample_payload = EXCLUDED.sample_payload,
        captured_at = NOW()
    `, [tenantId, schemaId, hash, JSON.stringify(sample)]);
  }

  await client.query(`
    DELETE FROM schema_sample_reservoir
    WHERE tenant_id = $1
      AND schema_id = $2
      AND id NOT IN (
        SELECT id
        FROM schema_sample_reservoir
        WHERE tenant_id = $1 AND schema_id = $2
        ORDER BY captured_at DESC
        LIMIT $3
      )
  `, [tenantId, schemaId, maxSamples]);
}

/**
 * Devuelve un string opaco que representa el estado actual de la memoria para
 * un par de conectores. Se usa como parte de la clave de caché Redis para que
 * un nuevo feedback invalide automáticamente los resultados cacheados.
 *
 * La query es O(1) con el índice idx_smm_connector_pair — no carga los rows.
 */
export async function getMemoryVersion(
  client: QueryableClient,
  tenantId: string,
  sourceSchemaId: string,
  targetSchemaId: string,
): Promise<string> {
  const result = await client.query<{ version: string }>(`
    SELECT COALESCE(
      TO_CHAR(MAX(updated_at) AT TIME ZONE 'UTC', 'YYYYMMDDHH24MISSMS'),
      '0'
    ) AS version
    FROM schema_mapping_memory
    WHERE tenant_id = $1
      AND source_connector_id = $2
      AND target_connector_id = $3
  `, [tenantId, sourceSchemaId, targetSchemaId]);

  return result.rows[0]?.version ?? '0';
}

export async function loadMappingMemoryEntries(
  client: QueryableClient,
  tenantId: string,
  sourceSchemaId: string,
  targetSchemaId: string,
  limit = 500,
): Promise<MappingMemoryEntry[]> {
  const result = await client.query<{
    source_connector_id: string;
    target_connector_id: string;
    source_path: string;
    target_path: string;
    accepted_count: number;
    rejected_count: number;
    average_confidence: number;
    last_accepted_at?: string;
  }>(`
    SELECT source_connector_id, target_connector_id,
           source_path, target_path, accepted_count, rejected_count,
           average_confidence, last_accepted_at
    FROM schema_mapping_memory
    WHERE tenant_id = $1
      AND source_connector_id = $2
      AND target_connector_id = $3
    ORDER BY accepted_count DESC, average_confidence DESC, last_accepted_at DESC NULLS LAST
    LIMIT $4
  `, [tenantId, sourceSchemaId, targetSchemaId, limit]);

  return result.rows.map(row => ({
    connectorAId: row.source_connector_id,
    connectorBId: row.target_connector_id,
    sourcePath: row.source_path,
    targetPath: row.target_path,
    acceptedCount: Number(row.accepted_count),
    rejectedCount: Number(row.rejected_count),
    averageConfidence: Number(row.average_confidence),
    lastAcceptedAt: row.last_accepted_at,
  }));
}

export async function rememberAcceptedMappings(
  client: QueryableClient,
  result: PersistableDiffResult,
  tenantId: string,
): Promise<void> {
  const similarityByPair = new Map(
    result.mismatches.renameCandidates.map(candidate => [
      `${candidate.fromPath}=>${candidate.toPath}`,
      candidate.similarityPct / 100,
    ]),
  );

  const acceptedMappings = result.blueprint
    .filter(action => action.action === 'rename' && action.fromPath && action.toPath);

  for (const mapping of acceptedMappings) {
    const sourcePath = mapping.fromPath!;
    const targetPath = mapping.toPath!;
    const averageConfidence = similarityByPair.get(`${sourcePath}=>${targetPath}`) ?? 0.90;

    await client.query(`
      INSERT INTO schema_mapping_memory (
        tenant_id, source_connector_id, target_connector_id,
        source_path, target_path, accepted_count, rejected_count,
        average_confidence, last_report_id, last_accepted_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, 1, 0, $6, $7, NOW(), NOW()
      )
      ON CONFLICT (tenant_id, source_connector_id, target_connector_id, source_path, target_path)
      DO UPDATE SET
        accepted_count = CASE
          WHEN schema_mapping_memory.last_report_id = EXCLUDED.last_report_id THEN schema_mapping_memory.accepted_count
          ELSE schema_mapping_memory.accepted_count + 1
        END,
        -- Running mean of similarity confidence, adjusted by a Laplace-smoothed acceptance ratio:
        --   raw_mean  = (old_mean * n + new_confidence) / (n + 1)
        --   adj_ratio = (n + 1 - 0.5 * rejects) / (n + rejects + 2)
        --   final     = raw_mean * adj_ratio
        -- With rejects = 0 (no feedback API yet) this yields mean * (n+1)/(n+2),
        -- slightly conservative but ready for rejection tracking when the feedback
        -- endpoint is added.
        average_confidence = CASE
          WHEN schema_mapping_memory.last_report_id = EXCLUDED.last_report_id
            THEN schema_mapping_memory.average_confidence
          ELSE LEAST(1.0, GREATEST(0.0,
            (
              (schema_mapping_memory.average_confidence * schema_mapping_memory.accepted_count + EXCLUDED.average_confidence)
              / NULLIF(schema_mapping_memory.accepted_count + 1.0, 0)
            ) * (
              (schema_mapping_memory.accepted_count + 1.0 - 0.5 * schema_mapping_memory.rejected_count)
              / NULLIF(schema_mapping_memory.accepted_count + schema_mapping_memory.rejected_count + 2.0, 0)
            )
          ))
        END,
        last_report_id = EXCLUDED.last_report_id,
        last_accepted_at = NOW(),
        updated_at = NOW()
    `, [
      tenantId,
      result.sourceSchemaId,
      result.targetSchemaId,
      sourcePath,
      targetPath,
      averageConfidence,
      result.reportId,
    ]);
  }
}

export async function persistDiffResultTransactional(
  client: QueryableClient,
  result: PersistableDiffResult,
  tenantId = result.tenantId || 'system',
): Promise<void> {
  await client.query('BEGIN');

  try {
    await upsertSchemaInventory(client, result.sourceFingerprint, result.fullSchemaA);
    await upsertSchemaInventory(client, result.targetFingerprint, result.fullSchemaB);

    await ensureConnectorVersion(client, result.sourceSchemaId, tenantId, result.sourceFingerprint, result.reportId);
    await ensureConnectorVersion(client, result.targetSchemaId, tenantId, result.targetFingerprint, result.reportId);

    await upsertSchemaDiffReport(client, result, tenantId);
    await rememberAcceptedMappings(client, result, tenantId);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}
