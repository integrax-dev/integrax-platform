import { pool } from './db.js';
import type {
  ContractChange,
  ConnectorContractBaseline,
  ConnectorFieldSpec,
  ContractChangeFilter,
} from '@integrax/connector-contract';

// ─── Baselines ────────────────────────────────────────────────────────────────

interface BaselineRow {
  id: string;
  connector_id: string;
  schema_version: string;
  fields: ConnectorFieldSpec[];
  registered_at: Date;
  updated_at: Date;
}

export async function getContractBaseline(connectorId: string): Promise<ConnectorContractBaseline | null> {
  const { rows } = await pool.query<BaselineRow>(
    `SELECT * FROM connector_contract_baselines WHERE connector_id = $1`,
    [connectorId],
  );
  if (!rows.length) return null;
  return {
    connectorId: rows[0].connector_id,
    schemaVersion: rows[0].schema_version,
    fields: rows[0].fields,
    registeredAt: rows[0].registered_at,
  };
}

export async function upsertContractBaseline(b: ConnectorContractBaseline): Promise<void> {
  await pool.query(
    `INSERT INTO connector_contract_baselines (connector_id, schema_version, fields, registered_at, updated_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (connector_id) DO UPDATE SET
       schema_version = EXCLUDED.schema_version,
       fields = EXCLUDED.fields,
       updated_at = NOW()`,
    [b.connectorId, b.schemaVersion, JSON.stringify(b.fields), b.registeredAt],
  );
}

// ─── Contract changes ─────────────────────────────────────────────────────────

interface ChangeRow {
  id: string;
  connector_id: string;
  field_path: string;
  change_type: string;
  impact_score: number;
  affected_tenant_count: number;
  detected_at: Date;
  schema_version: string | null;
  summary: string;
}

function rowToChange(r: ChangeRow): ContractChange {
  return {
    id: r.id,
    connectorId: r.connector_id,
    fieldPath: r.field_path,
    changeType: r.change_type as ContractChange['changeType'],
    impactScore: r.impact_score as ContractChange['impactScore'],
    affectedTenantCount: r.affected_tenant_count,
    detectedAt: r.detected_at,
    schemaVersion: r.schema_version ?? undefined,
    summary: r.summary,
  };
}

export async function saveContractChange(c: ContractChange): Promise<void> {
  await pool.query(
    `INSERT INTO connector_contract_changes
       (id, connector_id, field_path, change_type, impact_score,
        affected_tenant_count, detected_at, schema_version, summary)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT (id) DO NOTHING`,
    [c.id, c.connectorId, c.fieldPath, c.changeType, c.impactScore,
     c.affectedTenantCount, c.detectedAt, c.schemaVersion ?? null, c.summary],
  );
}

export async function listAllContractBaselines(): Promise<ConnectorContractBaseline[]> {
  const { rows } = await pool.query<BaselineRow>(
    `SELECT * FROM connector_contract_baselines ORDER BY connector_id`,
  );
  return rows.map(r => ({
    connectorId: r.connector_id,
    schemaVersion: r.schema_version,
    fields: r.fields,
    registeredAt: r.registered_at,
  }));
}

export async function listContractChanges(filter: ContractChangeFilter = {}): Promise<ContractChange[]> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (filter.connectorId) { conditions.push(`connector_id = $${idx++}`); params.push(filter.connectorId); }
  if (filter.changeType) { conditions.push(`change_type = $${idx++}`); params.push(filter.changeType); }
  if (filter.minImpactScore !== undefined) { conditions.push(`impact_score >= $${idx++}`); params.push(filter.minImpactScore); }
  if (filter.since) { conditions.push(`detected_at >= $${idx++}`); params.push(filter.since); }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = filter.limit ?? 500;

  const { rows } = await pool.query<ChangeRow>(
    `SELECT * FROM connector_contract_changes ${where} ORDER BY detected_at DESC LIMIT ${limit}`,
    params,
  );
  return rows.map(rowToChange);
}
