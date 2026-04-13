/**
 * Drift Store
 *
 * Postgres-backed persistence for drift incidents and baselines.
 * All schema comparison logic lives in schema-bridge; this is pure storage.
 */

import { pool } from './db.js';
import type { BridgeReport } from '@integrax/schema-bridge';

// ─── Domain types ─────────────────────────────────────────────────────────────

export type DriftProtocol =
  | 'sql'       // CREATE TABLE DDL
  | 'openapi'   // OpenAPI YAML/JSON
  | 'avro'      // Avro schema JSON
  | 'csv'       // CSV header row + optional sample rows
  | 'jsonl'     // Newline-delimited JSON (JSONL / NDJSON)
  | 'xml'       // Generic XML (element/attribute names as fields)
  | 'soap'      // WSDL/XSD — alias for xml with SOAP context
  | 'graphql'   // GraphQL SDL
  | 'parquet'   // Parquet schema JSON (column definitions)
  | 'protobuf'; // Protocol Buffer .proto (message field definitions)
export type DriftSeverity  = 'critical' | 'major' | 'minor';
export type DriftStatus    = 'open' | 'investigating' | 'resolved' | 'dismissed';
export type RoutingTarget  =
  | 'operator_review' | 'incident_alert' | 'timeline_trace' | 'auto_resolved'
  | 'operation_engine' | 'workflow_engine' | 'no_action';

/** Result of one LLM analysis call for a single escalation entry. */
export interface LLMAnalysisResult {
  escalationIndex: number;
  action: 'renamed_to' | 'truly_removed' | 'type_changed' | 'moved_to_nested' | 'needs_investigation';
  suggestion: string;
  confidence: number;
  reasoning: string;
  analyzedAt: string; // ISO
}

export interface DriftIncident {
  id: string;
  sourceId: string;
  protocol: DriftProtocol;
  severity: DriftSeverity;
  status: DriftStatus;
  bridgeReport: BridgeReport | null;
  impactScore: number | null;
  routingTarget: RoutingTarget | null;
  remediationHints: string[];
  affectedTenants: string[];
  /** AI analysis results — one entry per resolved escalation. Auto-populated for
   *  critical incidents; available on-demand for others. */
  llmAnalysis: LLMAnalysisResult[];
  detectedAt: Date;
  resolvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface DriftBaseline {
  id: string;
  sourceId: string;
  protocol: DriftProtocol;
  snapshot: Record<string, unknown>;
  version: number;
  capturedAt: Date;
  updatedAt: Date;
}

// ─── Row mappers ──────────────────────────────────────────────────────────────

interface IncidentRow {
  id: string; source_id: string; protocol: string; severity: string; status: string;
  bridge_report: unknown; impact_score: string | null; routing_target: string | null;
  remediation_hints: string[] | null; affected_tenants: string[];
  llm_analysis: LLMAnalysisResult[] | null;
  detected_at: Date; resolved_at: Date | null; created_at: Date; updated_at: Date;
}

interface BaselineRow {
  id: string; source_id: string; protocol: string; snapshot: unknown;
  version: number; captured_at: Date; updated_at: Date;
}

function toIncident(r: IncidentRow): DriftIncident {
  return {
    id: r.id,
    sourceId: r.source_id,
    protocol: r.protocol as DriftProtocol,
    severity: r.severity as DriftSeverity,
    status: r.status as DriftStatus,
    bridgeReport: r.bridge_report as BridgeReport | null,
    impactScore: r.impact_score !== null ? Number(r.impact_score) : null,
    routingTarget: r.routing_target as RoutingTarget | null,
    remediationHints: r.remediation_hints ?? [],
    affectedTenants: r.affected_tenants ?? [],
    llmAnalysis: r.llm_analysis ?? [],
    detectedAt: r.detected_at,
    resolvedAt: r.resolved_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function toBaseline(r: BaselineRow): DriftBaseline {
  return {
    id: r.id,
    sourceId: r.source_id,
    protocol: r.protocol as DriftProtocol,
    snapshot: r.snapshot as Record<string, unknown>,
    version: r.version,
    capturedAt: r.captured_at,
    updatedAt: r.updated_at,
  };
}

// ─── Incidents ────────────────────────────────────────────────────────────────

export async function listDriftIncidents(opts?: {
  status?: DriftStatus[];
  protocol?: DriftProtocol[];
  severity?: DriftSeverity[];
  sourceId?: string;
  limit?: number;
  offset?: number;
}): Promise<DriftIncident[]> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let n = 1;

  if (opts?.status?.length)   { conditions.push(`status = ANY($${n++})`);      params.push(opts.status); }
  if (opts?.protocol?.length) { conditions.push(`protocol = ANY($${n++})`);    params.push(opts.protocol); }
  if (opts?.severity?.length) { conditions.push(`severity = ANY($${n++})`);    params.push(opts.severity); }
  if (opts?.sourceId)         { conditions.push(`source_id = $${n++}`);        params.push(opts.sourceId); }

  const where  = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit  = opts?.limit  ?? 100;
  const offset = opts?.offset ?? 0;
  params.push(limit, offset);

  const sql = `SELECT * FROM drift_incidents ${where} ORDER BY detected_at DESC LIMIT $${n++} OFFSET $${n++}`;
  const result = await pool.query<IncidentRow>(sql, params);
  return result.rows.map(toIncident);
}

export async function getDriftIncident(id: string): Promise<DriftIncident | null> {
  const result = await pool.query<IncidentRow>('SELECT * FROM drift_incidents WHERE id = $1', [id]);
  return result.rows.length ? toIncident(result.rows[0]) : null;
}

export async function saveDriftIncident(inc: DriftIncident): Promise<string> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO drift_incidents
       (id, source_id, protocol, severity, status, bridge_report, impact_score, routing_target,
        remediation_hints, affected_tenants, detected_at, resolved_at, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
     ON CONFLICT (id) DO UPDATE SET
       status            = EXCLUDED.status,
       bridge_report     = EXCLUDED.bridge_report,
       impact_score      = EXCLUDED.impact_score,
       routing_target    = EXCLUDED.routing_target,
       remediation_hints = EXCLUDED.remediation_hints,
       affected_tenants  = EXCLUDED.affected_tenants,
       resolved_at       = EXCLUDED.resolved_at,
       updated_at        = EXCLUDED.updated_at
     RETURNING id`,
    [
      inc.id, inc.sourceId, inc.protocol, inc.severity, inc.status,
      inc.bridgeReport ? JSON.stringify(inc.bridgeReport) : null,
      inc.impactScore, inc.routingTarget,
      JSON.stringify(inc.remediationHints), inc.affectedTenants,
      inc.detectedAt, inc.resolvedAt, inc.createdAt, inc.updatedAt,
    ],
  );
  return result.rows[0].id;
}

export async function updateDriftIncidentStatus(
  id: string,
  status: DriftStatus,
): Promise<void> {
  const resolvedAt = status === 'resolved' ? new Date() : null;
  await pool.query(
    `UPDATE drift_incidents SET status = $1, resolved_at = $2, updated_at = NOW() WHERE id = $3`,
    [status, resolvedAt, id],
  );
}

/**
 * Find the most recent open or investigating incident for a (sourceId, protocol) pair.
 * Used by ingest() to deduplicate: if drift is re-detected on the same source before
 * the previous incident is resolved, update it instead of creating a duplicate.
 */
export async function findOpenIncident(
  sourceId: string,
  protocol: DriftProtocol,
): Promise<DriftIncident | null> {
  const result = await pool.query<IncidentRow>(
    `SELECT * FROM drift_incidents
     WHERE source_id = $1 AND protocol = $2 AND status IN ('open','investigating')
     ORDER BY detected_at DESC
     LIMIT 1`,
    [sourceId, protocol],
  );
  return result.rows.length ? toIncident(result.rows[0]) : null;
}

/**
 * Update the bridge report + scoring fields on an existing incident.
 * Used when drift is re-detected while the previous incident is still open —
 * the report is refreshed in-place rather than creating a duplicate.
 */
export async function updateDriftIncidentReport(
  id: string,
  updates: Pick<DriftIncident, 'bridgeReport' | 'impactScore' | 'severity' | 'routingTarget' | 'remediationHints' | 'affectedTenants'>,
): Promise<void> {
  await pool.query(
    `UPDATE drift_incidents
     SET bridge_report     = $1,
         impact_score      = $2,
         severity          = $3,
         routing_target    = $4,
         remediation_hints = $5,
         affected_tenants  = $6,
         updated_at        = NOW()
     WHERE id = $7`,
    [
      updates.bridgeReport ? JSON.stringify(updates.bridgeReport) : null,
      updates.impactScore,
      updates.severity,
      updates.routingTarget,
      JSON.stringify(updates.remediationHints),
      updates.affectedTenants,
      id,
    ],
  );
}

/**
 * Resolve all open/investigating incidents for a given (sourceId, protocol).
 * Called automatically when a new baseline is captured — the operator has
 * accepted the current schema as the new reference point, so prior incidents
 * no longer represent real drift.
 */
export async function resolveOpenIncidentsBySource(
  sourceId: string,
  protocol: DriftProtocol,
): Promise<number> {
  const result = await pool.query<{ count: string }>(
    `UPDATE drift_incidents
     SET status     = 'resolved',
         resolved_at = NOW(),
         updated_at  = NOW()
     WHERE source_id = $1 AND protocol = $2 AND status IN ('open','investigating')
     RETURNING id`,
    [sourceId, protocol],
  );
  return result.rowCount ?? 0;
}

// ─── Baselines ────────────────────────────────────────────────────────────────

export async function getBaseline(sourceId: string, protocol: DriftProtocol): Promise<DriftBaseline | null> {
  const result = await pool.query<BaselineRow>(
    'SELECT * FROM drift_baselines WHERE source_id = $1 AND protocol = $2',
    [sourceId, protocol],
  );
  return result.rows.length ? toBaseline(result.rows[0]) : null;
}

export async function saveBaseline(
  sourceId: string,
  protocol: DriftProtocol,
  snapshot: Record<string, unknown>,
): Promise<void> {
  await pool.query(
    `INSERT INTO drift_baselines (id, source_id, protocol, snapshot, version, captured_at, updated_at)
     VALUES (gen_random_uuid()::text, $1, $2, $3, 1, NOW(), NOW())
     ON CONFLICT (source_id, protocol) DO UPDATE SET
       snapshot    = EXCLUDED.snapshot,
       version     = drift_baselines.version + 1,
       updated_at  = NOW()`,
    [sourceId, protocol, JSON.stringify(snapshot)],
  );
}

export async function listBaselines(): Promise<DriftBaseline[]> {
  const result = await pool.query<BaselineRow>('SELECT * FROM drift_baselines ORDER BY captured_at DESC');
  return result.rows.map(toBaseline);
}

// ─── LLM analysis results ─────────────────────────────────────────────────────

/**
 * Upsert a single LLM analysis result for a given escalation index.
 * If a result for that index already exists it is replaced (re-analyze support).
 */
export async function saveDriftLlmAnalysis(
  incidentId: string,
  result: LLMAnalysisResult,
): Promise<void> {
  // Remove any existing entry for the same escalationIndex, then append the new one.
  await pool.query(
    `UPDATE drift_incidents
     SET llm_analysis = (
       -- strip old entry for this index, then append new one
       COALESCE(
         (SELECT jsonb_agg(elem)
          FROM jsonb_array_elements(llm_analysis) AS elem
          WHERE (elem->>'escalationIndex')::int <> $2
         ), '[]'::jsonb
       ) || jsonb_build_array($3::jsonb)
     ),
     updated_at = NOW()
     WHERE id = $1`,
    [incidentId, result.escalationIndex, JSON.stringify(result)],
  );
}
