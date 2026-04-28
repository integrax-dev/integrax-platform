import { pool } from './db.js';
import type { MappingRecord, MappingLifecycleState } from '@integrax/mapping-governance';

interface Row {
  id: string;
  tenant_id: string | null;
  connector_a_id: string;
  connector_b_id: string;
  source_path: string;
  target_path: string;
  entity_type: string | null;
  state: string;
  confidence: number;
  accepted_count: number;
  rejected_count: number;
  correction_count: number;
  approved_by: string | null;
  created_at: Date;
  updated_at: Date;
}

function rowToRecord(r: Row): MappingRecord {
  return {
    id: r.id,
    tenantId: r.tenant_id ?? undefined,
    connectorAId: r.connector_a_id,
    connectorBId: r.connector_b_id,
    sourcePath: r.source_path,
    targetPath: r.target_path,
    entityType: r.entity_type ?? undefined,
    state: r.state as MappingLifecycleState,
    confidence: r.confidence,
    acceptedCount: r.accepted_count,
    rejectedCount: r.rejected_count,
    correctionCount: r.correction_count,
    approvedBy: r.approved_by ?? undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export async function getMappingRecord(id: string): Promise<MappingRecord | null> {
  const result = await pool.query<Row>('SELECT * FROM mapping_governance WHERE id = $1', [id]);
  return result.rows.length > 0 ? rowToRecord(result.rows[0]) : null;
}

export async function listMappingRecords(opts?: {
  tenantId?: string;
  connectorAId?: string;
  connectorBId?: string;
  state?: MappingLifecycleState;
}): Promise<MappingRecord[]> {
  const result = await pool.query<Row>(
    `SELECT * FROM mapping_governance
     WHERE ($1::text IS NULL OR tenant_id = $1 OR tenant_id IS NULL)
       AND ($2::text IS NULL OR connector_a_id = $2)
       AND ($3::text IS NULL OR connector_b_id = $3)
       AND ($4::text IS NULL OR state = $4)
     ORDER BY updated_at DESC`,
    [opts?.tenantId ?? null, opts?.connectorAId ?? null, opts?.connectorBId ?? null, opts?.state ?? null],
  );
  return result.rows.map(rowToRecord);
}

export async function saveMappingRecord(m: MappingRecord): Promise<string> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO mapping_governance
       (id,tenant_id,connector_a_id,connector_b_id,source_path,target_path,entity_type,state,confidence,
        accepted_count,rejected_count,correction_count,approved_by,created_at,updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
     ON CONFLICT (tenant_id,connector_a_id,connector_b_id,source_path,target_path) DO UPDATE SET
       entity_type=$7, state=$8, confidence=$9, accepted_count=$10, rejected_count=$11,
       correction_count=$12, approved_by=$13, updated_at=$15
     RETURNING id`,
    [
      m.id, m.tenantId ?? null, m.connectorAId, m.connectorBId,
      m.sourcePath, m.targetPath, m.entityType ?? null,
      m.state, m.confidence, m.acceptedCount, m.rejectedCount, m.correctionCount,
      m.approvedBy ?? null, m.createdAt, m.updatedAt,
    ],
  );
  return result.rows[0].id;
}

export async function deleteMappingRecord(id: string): Promise<void> {
  await pool.query('DELETE FROM mapping_governance WHERE id = $1', [id]);
}
