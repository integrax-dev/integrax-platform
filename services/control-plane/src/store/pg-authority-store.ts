import { pool } from './db.js';
import type { AuthorityRule, TrustScore } from '@integrax/authority-engine';

// ─── Authority rules ──────────────────────────────────────────────────────────

interface RuleRow {
  id: string;
  tenant_id: string | null;
  entity_type: string | null;
  field: string | null;
  connector_a: string | null;
  connector_b: string | null;
  mode: string;
  authority_connector: string | null;
  priority: number;
  approved_by: string | null;
  enabled: boolean;
  created_at: Date;
  updated_at: Date;
}

function rowToRule(r: RuleRow): AuthorityRule {
  return {
    id: r.id,
    tenantId: r.tenant_id ?? undefined,
    entityType: r.entity_type ?? undefined,
    field: r.field ?? undefined,
    connectorPair: r.connector_a && r.connector_b
      ? [r.connector_a, r.connector_b]
      : undefined,
    mode: r.mode as AuthorityRule['mode'],
    authorityConnector: r.authority_connector ?? undefined,
    priority: r.priority,
    approvedBy: r.approved_by ?? undefined,
    enabled: r.enabled,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export async function listAuthorityRules(tenantId?: string): Promise<AuthorityRule[]> {
  const result = await pool.query<RuleRow>(
    `SELECT * FROM authority_rules WHERE ($1::text IS NULL OR tenant_id = $1 OR tenant_id IS NULL) ORDER BY priority DESC`,
    [tenantId ?? null],
  );
  return result.rows.map(rowToRule);
}

export async function getAuthorityRule(id: string): Promise<AuthorityRule | null> {
  const result = await pool.query<RuleRow>('SELECT * FROM authority_rules WHERE id = $1', [id]);
  return result.rows.length > 0 ? rowToRule(result.rows[0]) : null;
}

export async function saveAuthorityRule(r: AuthorityRule): Promise<string> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO authority_rules
       (id,tenant_id,entity_type,field,connector_a,connector_b,mode,authority_connector,priority,approved_by,enabled,created_at,updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     ON CONFLICT (id) DO UPDATE SET
       tenant_id=$2, entity_type=$3, field=$4, connector_a=$5, connector_b=$6,
       mode=$7, authority_connector=$8, priority=$9, approved_by=$10, enabled=$11, updated_at=$13
     RETURNING id`,
    [
      r.id, r.tenantId ?? null, r.entityType ?? null, r.field ?? null,
      r.connectorPair?.[0] ?? null, r.connectorPair?.[1] ?? null,
      r.mode, r.authorityConnector ?? null, r.priority, r.approvedBy ?? null,
      r.enabled, r.createdAt, r.updatedAt,
    ],
  );
  return result.rows[0].id;
}

export async function deleteAuthorityRule(id: string): Promise<void> {
  await pool.query('DELETE FROM authority_rules WHERE id = $1', [id]);
}

// ─── Trust scores ─────────────────────────────────────────────────────────────

interface TrustRow {
  id: string;
  tenant_id: string;
  connector_id: string;
  entity_type: string | null;
  score: number;
  accepted_count: number;
  rejected_count: number;
  correction_count: number;
  last_updated: Date;
}

function rowToTrust(r: TrustRow): TrustScore {
  return {
    connectorId: r.connector_id,
    tenantId: r.tenant_id,
    entityType: r.entity_type ?? undefined,
    score: r.score,
    acceptedCount: r.accepted_count,
    rejectedCount: r.rejected_count,
    correctionCount: r.correction_count,
    lastUpdated: r.last_updated,
  };
}

export async function listTrustScores(tenantId: string): Promise<TrustScore[]> {
  const result = await pool.query<TrustRow>(
    'SELECT * FROM connector_trust_scores WHERE tenant_id = $1',
    [tenantId],
  );
  return result.rows.map(rowToTrust);
}

export async function upsertTrustScore(id: string, s: TrustScore): Promise<void> {
  await pool.query(
    `INSERT INTO connector_trust_scores
       (id,tenant_id,connector_id,entity_type,score,accepted_count,rejected_count,correction_count,last_updated)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT (tenant_id,connector_id,entity_type) DO UPDATE SET
       score=$5, accepted_count=$6, rejected_count=$7, correction_count=$8, last_updated=$9`,
    [id, s.tenantId, s.connectorId, s.entityType ?? null, s.score, s.acceptedCount, s.rejectedCount, s.correctionCount, s.lastUpdated],
  );
}
