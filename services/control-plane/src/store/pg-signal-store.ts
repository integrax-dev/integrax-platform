import { pool } from './db.js';
import type { ConsistencySignal, ConsistencyCase, TimelineEvent, CaseStatus } from '@integrax/consistency-signals';

// ─── Signals ──────────────────────────────────────────────────────────────────

interface SignalRow {
  id: string;
  tenant_id: string;
  kind: string;
  severity: string;
  entity_type: string;
  entity_id: string | null;
  connector_a: string;
  connector_b: string | null;
  field_path: string | null;
  tags: Record<string, string>;
  deduplication_key: string;
  occurred_at: Date;
  resolved_at: Date | null;
  case_id: string | null;
}

function rowToSignal(r: SignalRow): ConsistencySignal {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    kind: r.kind as ConsistencySignal['kind'],
    severity: r.severity as ConsistencySignal['severity'],
    entityType: r.entity_type,
    entityId: r.entity_id ?? undefined,
    connectorA: r.connector_a,
    connectorB: r.connector_b ?? undefined,
    fieldPath: r.field_path ?? undefined,
    tags: r.tags,
    deduplicationKey: r.deduplication_key,
    occurredAt: r.occurred_at,
    resolvedAt: r.resolved_at ?? undefined,
    caseId: r.case_id ?? undefined,
  };
}

export async function saveSignal(s: ConsistencySignal): Promise<void> {
  await pool.query(
    `INSERT INTO consistency_signals
       (id,tenant_id,kind,severity,entity_type,entity_id,connector_a,connector_b,field_path,tags,deduplication_key,occurred_at,resolved_at,case_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
     ON CONFLICT (id) DO UPDATE SET
       resolved_at=$13, case_id=$14`,
    [
      s.id, s.tenantId, s.kind, s.severity, s.entityType, s.entityId ?? null,
      s.connectorA, s.connectorB ?? null, s.fieldPath ?? null,
      JSON.stringify(s.tags), s.deduplicationKey, s.occurredAt,
      s.resolvedAt ?? null, s.caseId ?? null,
    ],
  );
}

export async function listSignals(tenantId: string, opts?: { caseId?: string; entityType?: string }): Promise<ConsistencySignal[]> {
  const result = await pool.query<SignalRow>(
    `SELECT * FROM consistency_signals
     WHERE tenant_id = $1
       AND ($2::text IS NULL OR case_id = $2)
       AND ($3::text IS NULL OR entity_type = $3)
     ORDER BY occurred_at DESC`,
    [tenantId, opts?.caseId ?? null, opts?.entityType ?? null],
  );
  return result.rows.map(rowToSignal);
}

export async function findRecentSignalByDedup(dedupKey: string, windowMs: number): Promise<ConsistencySignal | null> {
  const since = new Date(Date.now() - windowMs);
  const result = await pool.query<SignalRow>(
    `SELECT * FROM consistency_signals
     WHERE deduplication_key = $1 AND occurred_at > $2
     ORDER BY occurred_at DESC LIMIT 1`,
    [dedupKey, since],
  );
  return result.rows.length > 0 ? rowToSignal(result.rows[0]) : null;
}

// ─── Cases ────────────────────────────────────────────────────────────────────

interface CaseRow {
  id: string;
  tenant_id: string;
  entity_type: string;
  entity_id: string | null;
  title: string;
  status: string;
  severity: string;
  assigned_to: string | null;
  created_at: Date;
  updated_at: Date;
  resolved_at: Date | null;
}

function rowToCase(r: CaseRow, signalIds: string[]): ConsistencyCase {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    entityType: r.entity_type,
    entityId: r.entity_id ?? undefined,
    title: r.title,
    status: r.status as CaseStatus,
    severity: r.severity as ConsistencyCase['severity'],
    signalIds,
    assignedTo: r.assigned_to ?? undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    resolvedAt: r.resolved_at ?? undefined,
  };
}

export async function saveCase(c: ConsistencyCase): Promise<void> {
  await pool.query(
    `INSERT INTO consistency_cases
       (id,tenant_id,entity_type,entity_id,title,status,severity,assigned_to,created_at,updated_at,resolved_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     ON CONFLICT (id) DO UPDATE SET
       title=$5, status=$6, severity=$7, assigned_to=$8, updated_at=$10, resolved_at=$11`,
    [
      c.id, c.tenantId, c.entityType, c.entityId ?? null, c.title, c.status, c.severity,
      c.assignedTo ?? null, c.createdAt, c.updatedAt, c.resolvedAt ?? null,
    ],
  );
}

export async function getCase(id: string): Promise<ConsistencyCase | null> {
  const [caseResult, signalResult] = await Promise.all([
    pool.query<CaseRow>('SELECT * FROM consistency_cases WHERE id = $1', [id]),
    pool.query<{ id: string }>('SELECT id FROM consistency_signals WHERE case_id = $1', [id]),
  ]);
  if (caseResult.rows.length === 0) return null;
  return rowToCase(caseResult.rows[0], signalResult.rows.map(r => r.id));
}

export async function listCases(tenantId: string, opts?: { entityType?: string; status?: CaseStatus }): Promise<ConsistencyCase[]> {
  const result = await pool.query<CaseRow>(
    `SELECT * FROM consistency_cases
     WHERE tenant_id = $1
       AND ($2::text IS NULL OR entity_type = $2)
       AND ($3::text IS NULL OR status = $3)
     ORDER BY updated_at DESC`,
    [tenantId, opts?.entityType ?? null, opts?.status ?? null],
  );
  if (result.rows.length === 0) return [];

  const caseIds = result.rows.map(r => r.id);
  const signalResult = await pool.query<{ id: string; case_id: string }>(
    'SELECT id, case_id FROM consistency_signals WHERE case_id = ANY($1)',
    [caseIds],
  );

  const signalsByCaseId = new Map<string, string[]>();
  for (const row of signalResult.rows) {
    const arr = signalsByCaseId.get(row.case_id) ?? [];
    arr.push(row.id);
    signalsByCaseId.set(row.case_id, arr);
  }

  return result.rows.map(r => rowToCase(r, signalsByCaseId.get(r.id) ?? []));
}

// ─── Timeline ─────────────────────────────────────────────────────────────────

interface TimelineRow {
  id: string;
  case_id: string;
  tenant_id: string;
  kind: string;
  actor: string | null;
  description: string;
  meta: Record<string, string | number | boolean>;
  occurred_at: Date;
  sensitive: boolean;
}

function rowToTimeline(r: TimelineRow): TimelineEvent {
  return {
    id: r.id,
    caseId: r.case_id,
    tenantId: r.tenant_id,
    kind: r.kind as TimelineEvent['kind'],
    actor: r.actor ?? undefined,
    description: r.description,
    meta: r.meta,
    occurredAt: r.occurred_at,
    sensitive: false,
  };
}

export async function saveTimelineEvent(e: TimelineEvent): Promise<void> {
  await pool.query(
    `INSERT INTO consistency_timeline (id,case_id,tenant_id,kind,actor,description,meta,occurred_at,sensitive)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,FALSE) ON CONFLICT (id) DO NOTHING`,
    [e.id, e.caseId, e.tenantId, e.kind, e.actor ?? null, e.description, JSON.stringify(e.meta), e.occurredAt],
  );
}

export async function getTimeline(caseId: string): Promise<TimelineEvent[]> {
  const result = await pool.query<TimelineRow>(
    'SELECT * FROM consistency_timeline WHERE case_id = $1 ORDER BY occurred_at ASC',
    [caseId],
  );
  return result.rows.map(rowToTimeline);
}
