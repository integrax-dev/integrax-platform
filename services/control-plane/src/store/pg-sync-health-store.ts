import { pool } from './db.js';
import type { TenantSyncHealth, ConnectorHealthSnapshot } from '@integrax/sync-health';

// ─── Row types ────────────────────────────────────────────────────────────────

interface HealthRow {
  tenant_id: string;
  evaluated_at: Date;
  mapping_validity_score: number;
  reconciliation_backlog: number;
  drift_detected_flag: boolean;
  active_behavior_profile: string | null;
  criticality_tier: string;
  open_case_count: number;
  signal_count_24h: number;
}

interface ConnectorHealthRow {
  connector_id: string;
  status: string;
  last_successful_sync_at: Date | null;
  last_sync_attempt_at: Date | null;
  consecutive_failures: number;
  pipeline_lag_ms: number | null;
}

function rowToHealth(r: HealthRow, connectors: ConnectorHealthRow[]): TenantSyncHealth {
  return {
    tenantId: r.tenant_id,
    evaluatedAt: r.evaluated_at,
    connectors: connectors.map(c => ({
      connectorId: c.connector_id,
      status: c.status as ConnectorHealthSnapshot['status'],
      lastSuccessfulSyncAt: c.last_successful_sync_at,
      lastSyncAttemptAt: c.last_sync_attempt_at,
      consecutiveFailures: c.consecutive_failures,
      pipelineLagMs: c.pipeline_lag_ms,
    })),
    mappingValidityScore: r.mapping_validity_score,
    reconciliationBacklog: r.reconciliation_backlog,
    driftDetectedFlag: r.drift_detected_flag,
    activeBehaviorProfile: r.active_behavior_profile,
    criticalityTier: r.criticality_tier as TenantSyncHealth['criticalityTier'],
    openCaseCount: r.open_case_count,
    signalCount24h: r.signal_count_24h,
  };
}

// ─── Store ────────────────────────────────────────────────────────────────────

export async function getTenantSyncHealth(tenantId: string): Promise<TenantSyncHealth | null> {
  const { rows: hr } = await pool.query<HealthRow>(
    `SELECT * FROM tenant_sync_health WHERE tenant_id = $1`,
    [tenantId],
  );
  if (!hr.length) return null;
  const { rows: cr } = await pool.query<ConnectorHealthRow>(
    `SELECT connector_id, status, last_successful_sync_at, last_sync_attempt_at,
            consecutive_failures, pipeline_lag_ms
     FROM tenant_connector_health WHERE tenant_id = $1 ORDER BY connector_id`,
    [tenantId],
  );
  return rowToHealth(hr[0], cr);
}

export async function upsertTenantSyncHealth(h: TenantSyncHealth): Promise<void> {
  await pool.query(
    `INSERT INTO tenant_sync_health
       (tenant_id, evaluated_at, mapping_validity_score, reconciliation_backlog,
        drift_detected_flag, active_behavior_profile, criticality_tier,
        open_case_count, signal_count_24h, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW())
     ON CONFLICT (tenant_id) DO UPDATE SET
       evaluated_at = EXCLUDED.evaluated_at,
       mapping_validity_score = EXCLUDED.mapping_validity_score,
       reconciliation_backlog = EXCLUDED.reconciliation_backlog,
       drift_detected_flag = EXCLUDED.drift_detected_flag,
       active_behavior_profile = EXCLUDED.active_behavior_profile,
       criticality_tier = EXCLUDED.criticality_tier,
       open_case_count = EXCLUDED.open_case_count,
       signal_count_24h = EXCLUDED.signal_count_24h,
       updated_at = NOW()`,
    [h.tenantId, h.evaluatedAt, h.mappingValidityScore, h.reconciliationBacklog,
     h.driftDetectedFlag, h.activeBehaviorProfile, h.criticalityTier,
     h.openCaseCount, h.signalCount24h],
  );

  for (const c of h.connectors) {
    await pool.query(
      `INSERT INTO tenant_connector_health
         (tenant_id, connector_id, status, last_successful_sync_at,
          last_sync_attempt_at, consecutive_failures, pipeline_lag_ms, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())
       ON CONFLICT (tenant_id, connector_id) DO UPDATE SET
         status = EXCLUDED.status,
         last_successful_sync_at = EXCLUDED.last_successful_sync_at,
         last_sync_attempt_at = EXCLUDED.last_sync_attempt_at,
         consecutive_failures = EXCLUDED.consecutive_failures,
         pipeline_lag_ms = EXCLUDED.pipeline_lag_ms,
         updated_at = NOW()`,
      [h.tenantId, c.connectorId, c.status, c.lastSuccessfulSyncAt,
       c.lastSyncAttemptAt, c.consecutiveFailures, c.pipelineLagMs],
    );
  }
}

export async function listTenantSyncHealth(
  opts: { criticalityTier?: string } = {},
): Promise<TenantSyncHealth[]> {
  const where = opts.criticalityTier
    ? `WHERE criticality_tier = ANY($1::text[])
         AND criticality_tier >= (
           SELECT unnest FROM unnest(ARRAY['low','medium','high','critical'])
           WHERE unnest = $1::text
           LIMIT 1
         )`
    : '';

  const { rows: healthRows } = await pool.query<HealthRow & { tenant_id: string }>(
    opts.criticalityTier
      ? `SELECT * FROM tenant_sync_health
         WHERE criticality_tier IN (
           SELECT unnest FROM unnest(ARRAY['low','medium','high','critical']) WITH ORDINALITY t(unnest, ord)
           WHERE ord >= (
             SELECT ord FROM unnest(ARRAY['low','medium','high','critical']) WITH ORDINALITY t2(unnest, ord)
             WHERE t2.unnest = $1
           )
         ) ORDER BY evaluated_at DESC`
      : `SELECT * FROM tenant_sync_health ORDER BY evaluated_at DESC`,
    opts.criticalityTier ? [opts.criticalityTier] : [],
  );

  if (!healthRows.length) return [];

  const tenantIds = healthRows.map(r => r.tenant_id);
  const { rows: connRows } = await pool.query<ConnectorHealthRow & { tenant_id: string }>(
    `SELECT tenant_id, connector_id, status, last_successful_sync_at,
            last_sync_attempt_at, consecutive_failures, pipeline_lag_ms
     FROM tenant_connector_health WHERE tenant_id = ANY($1) ORDER BY tenant_id, connector_id`,
    [tenantIds],
  );

  const connByTenant = new Map<string, ConnectorHealthRow[]>();
  for (const r of connRows) {
    const arr = connByTenant.get(r.tenant_id) ?? [];
    arr.push(r);
    connByTenant.set(r.tenant_id, arr);
  }

  void where;
  return healthRows.map(r => rowToHealth(r, connByTenant.get(r.tenant_id) ?? []));
}

// ─── Record a sync result directly in Postgres ────────────────────────────────

function deriveConnectorStatus(consecutiveFailures: number): ConnectorHealthSnapshot['status'] {
  if (consecutiveFailures === 0) return 'healthy';
  if (consecutiveFailures >= 5) return 'failing';
  return 'degraded';
}

function deriveCriticalityTier(
  connectors: Array<{ status: string }>,
  openCaseCount: number,
  driftFlag: boolean,
  validityScore: number,
  backlog: number,
): TenantSyncHealth['criticalityTier'] {
  const failing = connectors.filter(c => c.status === 'failing').length;
  if (failing > 0 || openCaseCount >= 10 || driftFlag) return 'critical';
  const degraded = connectors.filter(c => c.status === 'degraded').length;
  if (degraded > 0 || openCaseCount >= 5 || validityScore < 0.5) return 'high';
  if (openCaseCount >= 2 || validityScore < 0.75 || backlog > 100) return 'medium';
  return 'low';
}

/**
 * Record a connector sync result directly in Postgres.
 * Computes updated connector status and re-derives criticalityTier for the tenant.
 */
export async function recordConnectorSyncResult(
  tenantId: string,
  connectorId: string,
  result: { success: boolean; lagMs?: number },
): Promise<TenantSyncHealth> {
  const now = new Date();

  const { rows: cr } = await pool.query<ConnectorHealthRow>(
    `SELECT * FROM tenant_connector_health WHERE tenant_id = $1 AND connector_id = $2`,
    [tenantId, connectorId],
  );
  const prev = cr[0] ?? null;

  const consecutiveFailures = result.success ? 0 : (prev?.consecutive_failures ?? 0) + 1;
  const status = deriveConnectorStatus(consecutiveFailures);
  const lastSuccessfulSyncAt = result.success ? now : (prev?.last_successful_sync_at ?? null);

  await pool.query(
    `INSERT INTO tenant_connector_health
       (tenant_id, connector_id, status, last_successful_sync_at, last_sync_attempt_at,
        consecutive_failures, pipeline_lag_ms, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())
     ON CONFLICT (tenant_id, connector_id) DO UPDATE SET
       status = EXCLUDED.status,
       last_successful_sync_at = EXCLUDED.last_successful_sync_at,
       last_sync_attempt_at = EXCLUDED.last_sync_attempt_at,
       consecutive_failures = EXCLUDED.consecutive_failures,
       pipeline_lag_ms = EXCLUDED.pipeline_lag_ms,
       updated_at = NOW()`,
    [tenantId, connectorId, status, lastSuccessfulSyncAt, now, consecutiveFailures, result.lagMs ?? null],
  );

  const { rows: allConn } = await pool.query<ConnectorHealthRow>(
    `SELECT connector_id, status, last_successful_sync_at, last_sync_attempt_at,
            consecutive_failures, pipeline_lag_ms
     FROM tenant_connector_health WHERE tenant_id = $1`,
    [tenantId],
  );

  const existingHealth = await getTenantSyncHealth(tenantId);
  const base = existingHealth ?? {
    tenantId,
    evaluatedAt: now,
    connectors: [],
    mappingValidityScore: 1.0,
    reconciliationBacklog: 0,
    driftDetectedFlag: false,
    activeBehaviorProfile: null,
    criticalityTier: 'low' as const,
    openCaseCount: 0,
    signalCount24h: 0,
  };

  const criticalityTier = deriveCriticalityTier(
    allConn,
    base.openCaseCount,
    base.driftDetectedFlag,
    base.mappingValidityScore,
    base.reconciliationBacklog,
  );

  const updated: TenantSyncHealth = {
    ...base,
    evaluatedAt: now,
    criticalityTier,
  };

  await upsertTenantSyncHealth(updated);
  return await getTenantSyncHealth(tenantId) ?? updated;
}
