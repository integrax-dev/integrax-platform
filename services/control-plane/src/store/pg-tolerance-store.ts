import { pool } from './db.js';
import type { TolerancePolicy } from '@integrax/tolerance-engine';

interface Row {
  id: string;
  tenant_id: string | null;
  entity_type: string | null;
  field: string | null;
  connector_a: string | null;
  connector_b: string | null;
  strategy: string;
  value: number;
  unit: string | null;
  priority: number;
  enabled: boolean;
  created_at: Date;
  updated_at: Date;
}

function rowToPolicy(r: Row): TolerancePolicy {
  return {
    id: r.id,
    tenantId: r.tenant_id ?? undefined,
    entityType: r.entity_type ?? undefined,
    field: r.field ?? undefined,
    connectorPair: r.connector_a && r.connector_b
      ? [r.connector_a, r.connector_b]
      : undefined,
    strategy: r.strategy as TolerancePolicy['strategy'],
    value: r.value,
    unit: r.unit ?? undefined,
    priority: r.priority,
    enabled: r.enabled,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export async function listTolerancePolicies(tenantId?: string): Promise<TolerancePolicy[]> {
  const result = await pool.query<Row>(
    `SELECT * FROM tolerance_policies WHERE ($1::text IS NULL OR tenant_id = $1 OR tenant_id IS NULL) ORDER BY priority DESC`,
    [tenantId ?? null],
  );
  return result.rows.map(rowToPolicy);
}

export async function getTolerancePolicy(id: string): Promise<TolerancePolicy | null> {
  const result = await pool.query<Row>('SELECT * FROM tolerance_policies WHERE id = $1', [id]);
  return result.rows.length > 0 ? rowToPolicy(result.rows[0]) : null;
}

export async function saveTolerancePolicy(p: TolerancePolicy): Promise<string> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO tolerance_policies
       (id,tenant_id,entity_type,field,connector_a,connector_b,strategy,value,unit,priority,enabled,created_at,updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     ON CONFLICT (id) DO UPDATE SET
       tenant_id=$2, entity_type=$3, field=$4, connector_a=$5, connector_b=$6,
       strategy=$7, value=$8, unit=$9, priority=$10, enabled=$11, updated_at=$13
     RETURNING id`,
    [
      p.id, p.tenantId ?? null, p.entityType ?? null, p.field ?? null,
      p.connectorPair?.[0] ?? null, p.connectorPair?.[1] ?? null,
      p.strategy, p.value, p.unit ?? null, p.priority, p.enabled,
      p.createdAt, p.updatedAt,
    ],
  );
  return result.rows[0].id;
}

export async function deleteTolerancePolicy(id: string): Promise<void> {
  await pool.query('DELETE FROM tolerance_policies WHERE id = $1', [id]);
}
