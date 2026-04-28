import { pool } from './db.js';
import type { IntentStatement } from '@integrax/behavior-engine';

interface Row {
  id: string;
  tenant_id: string;
  when_trigger: string;
  entity_type: string;
  field: string | null;
  connectors: string[];
  propagation: string;
  divergence_mode: string;
  authority_connector: string | null;
  tolerance_strategy: string | null;
  tolerance_value: number | null;
  tolerance_unit: string | null;
  country: string | null;
  enabled: boolean;
  created_at: Date;
  updated_at: Date;
}

function rowToIntent(r: Row): IntentStatement {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    when: r.when_trigger as IntentStatement['when'],
    entityType: r.entity_type,
    field: r.field ?? undefined,
    connectors: r.connectors,
    propagation: r.propagation as IntentStatement['propagation'],
    divergenceMode: r.divergence_mode as IntentStatement['divergenceMode'],
    authorityConnector: r.authority_connector ?? undefined,
    toleranceSpec:
      r.tolerance_strategy && r.tolerance_value !== null
        ? { strategy: r.tolerance_strategy as any, value: r.tolerance_value, unit: r.tolerance_unit ?? undefined }
        : undefined,
    country: r.country ?? undefined,
    enabled: r.enabled,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export async function listBehaviorIntents(tenantId: string): Promise<IntentStatement[]> {
  const result = await pool.query<Row>(
    'SELECT * FROM behavior_intents WHERE tenant_id = $1 ORDER BY created_at ASC',
    [tenantId],
  );
  return result.rows.map(rowToIntent);
}

export async function getBehaviorIntent(id: string): Promise<IntentStatement | null> {
  const result = await pool.query<Row>('SELECT * FROM behavior_intents WHERE id = $1', [id]);
  return result.rows.length > 0 ? rowToIntent(result.rows[0]) : null;
}

export async function saveBehaviorIntent(i: IntentStatement): Promise<string> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO behavior_intents
       (id,tenant_id,when_trigger,entity_type,field,connectors,propagation,divergence_mode,
        authority_connector,tolerance_strategy,tolerance_value,tolerance_unit,country,enabled,created_at,updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
     ON CONFLICT (id) DO UPDATE SET
       when_trigger=$3, entity_type=$4, field=$5, connectors=$6, propagation=$7,
       divergence_mode=$8, authority_connector=$9, tolerance_strategy=$10,
       tolerance_value=$11, tolerance_unit=$12, country=$13, enabled=$14, updated_at=$16
     RETURNING id`,
    [
      i.id, i.tenantId, i.when, i.entityType, i.field ?? null,
      i.connectors, i.propagation, i.divergenceMode,
      i.authorityConnector ?? null,
      i.toleranceSpec?.strategy ?? null, i.toleranceSpec?.value ?? null, i.toleranceSpec?.unit ?? null,
      i.country ?? null, i.enabled, i.createdAt, i.updatedAt,
    ],
  );
  return result.rows[0].id;
}

export async function deleteBehaviorIntent(id: string): Promise<void> {
  await pool.query('DELETE FROM behavior_intents WHERE id = $1', [id]);
}
