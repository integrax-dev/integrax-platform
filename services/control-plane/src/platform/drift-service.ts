/**
 * DriftService
 *
 * Compares an incoming schema payload against the stored baseline using
 * schema-bridge, scores the impact, persists the incident, and returns
 * a fully-enriched DriftIncident ready for the UI and the Temporal workflow.
 *
 * Supported protocols:
 *   sql      — raw DDL string  (CREATE TABLE …)
 *   openapi  — OpenAPI YAML or JSON string
 *   avro     — Avro schema JSON: { fields: [{ name, type }] }
 *   csv      — CSV header row + optional sample rows
 *   jsonl    — Newline-delimited JSON (JSONL / NDJSON) — schema inferred from first record
 *   xml      — Generic XML document — element/attribute names extracted as fields
 *   soap     — WSDL/XSD XML — same XML extraction, SOAP context label
 *   graphql  — GraphQL SDL — type fields extracted via regex (no AST dependency)
 *   parquet  — Parquet schema JSON: { columns: [{ name, type }] } or Spark-style schema
 *   protobuf — Protocol Buffer .proto — message field names/types extracted via regex
 */

import { ulid } from 'ulid';
import {
  SqlDdlAdapter,
  OpenApiAdapter,
  createSchemaBridge,
  assessImpact,
  type InferredJsonSchema,
} from '@integrax/schema-bridge';
import { createLogger } from '@integrax/logger';
import {
  getBaseline,
  saveBaseline,
  saveDriftIncident,
  saveDriftLlmAnalysis,
  updateDriftIncidentStatus,
  updateDriftIncidentReport,
  findOpenIncident,
  resolveOpenIncidentsBySource,
  listBaselines,
  type DriftProtocol,
  type DriftIncident,
  type DriftStatus,
  type RoutingTarget,
  type LLMAnalysisResult,
} from '../store/drift-store.js';

import {
  parseCsv, parseJsonl, parseAvro, parseXml,
  parseGraphql, parseParquet, parseProtobuf,
  type ParsedField,
} from './protocol-parsers.js';

const logger = createLogger({ service: 'drift-service' });

function makeSchema(fields: ParsedField[], sampleCount = 1): InferredJsonSchema {
  return { fields, fingerprint: ulid(), sampleCount } as unknown as InferredJsonSchema;
}

// ─── Normalize raw input to InferredJsonSchema ─────────────────────────────────

function toSchema(protocol: DriftProtocol, raw: string): InferredJsonSchema {
  switch (protocol) {
    case 'sql':
      return new SqlDdlAdapter(raw).adapt();

    case 'openapi': {
      const fmt = raw.trimStart().startsWith('{') ? 'json' : 'yaml';
      return new OpenApiAdapter(raw, fmt).adapt();
    }

    case 'csv':
      return makeSchema(parseCsv(raw));

    case 'jsonl':
      return makeSchema(parseJsonl(raw));

    case 'avro':
      return makeSchema(parseAvro(raw));

    case 'xml':
    case 'soap':
      return makeSchema(parseXml(raw));

    case 'graphql':
      return makeSchema(parseGraphql(raw));

    case 'parquet':
      return makeSchema(parseParquet(raw));

    case 'protobuf':
      return makeSchema(parseProtobuf(raw));
  }
}

// ─── Map schema-bridge RoutingTarget → our store RoutingTarget ─────────────────
// schema-bridge has more values than our original store type; we map them down.

function mapRouting(r: string): RoutingTarget {
  switch (r) {
    case 'incident_alert':  return 'incident_alert';
    case 'operator_review': return 'operator_review';
    case 'timeline_trace':  return 'timeline_trace';
    case 'auto_resolved':   return 'auto_resolved';
    default:                return 'operator_review';
  }
}

function scoreToDriftSeverity(score: number): DriftIncident['severity'] {
  if (score >= 70) return 'critical';
  if (score >= 35) return 'major';
  return 'minor';
}

// ─── LLM prompt + parse ───────────────────────────────────────────────────────

const LLM_SYSTEM_PROMPT = `You are a schema drift analyzer. Given context about a field-level change,
produce a concise structured recommendation. Always respond with valid JSON only, no prose outside the JSON.`;

const LLM_RESPONSE_SCHEMA = `
Respond with exactly this JSON shape (no markdown, no extra text):
{
  "action": "renamed_to" | "truly_removed" | "type_changed" | "moved_to_nested" | "needs_investigation",
  "suggestion": "<one-sentence recommendation for the operator>",
  "confidence": <0.0–1.0>,
  "reasoning": "<two-sentence max explanation>"
}`;

async function callLlm(promptSeed: string): Promise<Omit<LLMAnalysisResult, 'escalationIndex' | 'analyzedAt'> | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  try {
    const sdk = await import('@anthropic-ai/sdk');
    const client = new sdk.default({ apiKey: process.env.ANTHROPIC_API_KEY });
    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 256,
      system: LLM_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: promptSeed + LLM_RESPONSE_SCHEMA }],
    });
    const raw = message.content[0]?.type === 'text' ? message.content[0].text : '';
    const match = raw.match(/\{[\s\S]*\}/);
    const parsed = match ? JSON.parse(match[0]) : null;
    return parsed as Omit<LLMAnalysisResult, 'escalationIndex' | 'analyzedAt'> | null;
  } catch {
    return null;
  }
}

// ─── Outbound notifications ───────────────────────────────────────────────────
//
// Fire-and-forget. Reads env vars at call time so they can be set after startup.
//   SLACK_WEBHOOK_URL  — Slack incoming webhook
//   DRIFT_WEBHOOK_URL  — generic HTTP POST target (your own alerting stack)
//
// Only fires for critical/major incidents. Never blocks the ingest response.

function notifyInBackground(incident: DriftIncident): void {
  const slackUrl  = process.env.SLACK_WEBHOOK_URL;
  const driftUrl  = process.env.DRIFT_WEBHOOK_URL;
  if (!slackUrl && !driftUrl) return;

  const severityEmoji = incident.severity === 'critical' ? '🔴' : '🟡';
  const text = `${severityEmoji} *Schema drift detected* — \`${incident.sourceId}\` (${incident.protocol.toUpperCase()})\n` +
    `Severity: *${incident.severity}* · Impact: ${Math.round((incident.impactScore ?? 0) * 100)}% · ` +
    `Blast radius: ${incident.affectedTenants.length} tenant(s)\n` +
    `Incident ID: \`${incident.id}\``;

  const run = async () => {
    if (slackUrl) {
      await fetch(slackUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
    }
    if (driftUrl) {
      await fetch(driftUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: 'drift.incident.created',
          severity: incident.severity,
          sourceId: incident.sourceId,
          protocol: incident.protocol,
          incidentId: incident.id,
          impactScore: incident.impactScore,
          affectedTenants: incident.affectedTenants,
          detectedAt: incident.detectedAt,
        }),
      });
    }
  };
  run().catch(err => logger.warn({ err, incidentId: incident.id }, 'Drift notification failed'));
}

// ─── DriftService ─────────────────────────────────────────────────────────────

export class DriftService {
  private bridge = createSchemaBridge({
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    autoAcceptThreshold: 0.95,
    humanReviewThreshold: 0.75,
  });

  /**
   * Capture the current schema as the baseline for future comparisons.
   * Auto-resolves any open incidents for this source — the operator has
   * accepted the current schema as the new reference point.
   *
   * @returns number of open incidents that were auto-resolved (0 = no prior drift)
   */
  async captureBaseline(
    sourceId: string,
    protocol: DriftProtocol,
    raw: string,
  ): Promise<number> {
    const schema = toSchema(protocol, raw);
    await saveBaseline(sourceId, protocol, schema as unknown as Record<string, unknown>);

    const resolved = await resolveOpenIncidentsBySource(sourceId, protocol);
    if (resolved > 0) {
      logger.info({ sourceId, protocol, resolved }, 'Baseline captured — auto-resolved open incidents');
    } else {
      logger.info({ sourceId, protocol }, 'Baseline captured');
    }
    return resolved;
  }

  /**
   * Compare a new schema against the stored baseline.
   * - No baseline yet → stores it automatically, returns null (first-run).
   * - No drift → returns null.
   * - Drift detected → persists incident, returns it.
   */
  async ingest(
    sourceId: string,
    protocol: DriftProtocol,
    raw: string,
    affectedTenants: string[] = [],
  ): Promise<DriftIncident | null> {
    const current  = toSchema(protocol, raw);
    const baseline = await getBaseline(sourceId, protocol);

    if (!baseline) {
      await saveBaseline(sourceId, protocol, current as unknown as Record<string, unknown>);
      logger.info({ sourceId, protocol }, 'First-run: baseline saved');
      return null;
    }

    const baselineSchema = baseline.snapshot as unknown as InferredJsonSchema;

    const report = await this.bridge.compare({
      connectorAId: `${sourceId}:baseline`,
      connectorBId: `${sourceId}:current`,
      schemaA: baselineSchema,
      schemaB: current,
    });

    if (!report.diffs || report.diffs.length === 0) {
      logger.debug({ sourceId, protocol }, 'No drift detected');
      return null;
    }

    const assessment = assessImpact(report);
    const severity   = scoreToDriftSeverity(assessment.impactScore);
    const routing    = mapRouting(assessment.primaryRoutingTarget);
    const hints      = assessment.remediationHints.map(h => h.description);
    const score      = assessment.impactScore / 100;  // normalise 0-100 → 0-1 for display

    // ── Deduplication: reuse the existing open incident if one exists ───────────
    // If drift on the same source was already reported and not yet resolved,
    // refresh its report in-place instead of creating a duplicate incident.
    const existing = await findOpenIncident(sourceId, protocol);
    let incident: DriftIncident;

    if (existing) {
      await updateDriftIncidentReport(existing.id, {
        bridgeReport: report,
        impactScore: score,
        severity,
        routingTarget: routing,
        remediationHints: hints,
        affectedTenants,
      });
      incident = { ...existing, bridgeReport: report, impactScore: score, severity, routingTarget: routing, remediationHints: hints, affectedTenants };
      logger.warn(
        { sourceId, protocol, severity, score: assessment.impactScore, incidentId: existing.id },
        'Drift incident updated (existing open incident refreshed)',
      );
    } else {
      const now = new Date();
      incident = {
        id: ulid(),
        sourceId,
        protocol,
        severity,
        status: 'open',
        bridgeReport: report,
        impactScore: score,
        routingTarget: routing,
        remediationHints: hints,
        affectedTenants,
        llmAnalysis: [],
        detectedAt: now,
        resolvedAt: null,
        createdAt: now,
        updatedAt: now,
      };
      await saveDriftIncident(incident);
      logger.warn(
        { sourceId, protocol, severity, score: assessment.impactScore },
        'Drift incident created',
      );
    }

    // ── Notifications (Slack / generic webhook) — fire-and-forget ────────────
    if (severity === 'critical' || severity === 'major') {
      notifyInBackground(incident);
    }

    // ── Auto LLM analysis for critical incidents ──────────────────────────────
    const escalations = (report as any).requirementsReport?.llmEscalations ?? [];
    if (severity === 'critical' && escalations.length > 0 && process.env.ANTHROPIC_API_KEY) {
      this.analyzeEscalationsInBackground(incident.id, escalations);
    }

    return incident;
  }

  /**
   * Fire-and-forget: calls Claude Haiku for each LLM escalation and persists the
   * results. Only triggered automatically for critical incidents; other severities
   * use on-demand analysis via POST /api/drift/incidents/:id/analyze.
   */
  private analyzeEscalationsInBackground(
    incidentId: string,
    escalations: Array<{ promptSeed?: string }>,
  ): void {
    const run = async () => {
      for (let i = 0; i < escalations.length; i++) {
        const seed = escalations[i]?.promptSeed;
        if (!seed) continue;
        const analysis = await callLlm(seed);
        if (!analysis) continue;
        const result: LLMAnalysisResult = {
          ...analysis,
          escalationIndex: i,
          analyzedAt: new Date().toISOString(),
        };
        await saveDriftLlmAnalysis(incidentId, result);
        logger.info({ incidentId, escalationIndex: i, action: result.action }, 'Auto LLM analysis saved');
      }
    };
    run().catch(err =>
      logger.warn({ err, incidentId }, 'Background LLM analysis failed'),
    );
  }

  async updateStatus(id: string, status: DriftStatus): Promise<void> {
    await updateDriftIncidentStatus(id, status);
  }

  async listBaselines() {
    return listBaselines();
  }
}

export const driftService = new DriftService();
