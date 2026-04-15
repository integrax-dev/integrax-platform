/**
 * Drift API Routes  /api/drift
 *
 * Endpoints:
 *   GET    /api/drift/incidents                List incidents (filterable)
 *   GET    /api/drift/incidents/:id            Single incident with full BridgeReport
 *   POST   /api/drift/incidents/:id/status     Update status (open→investigating→resolved→dismissed)
 *   POST   /api/drift/incidents/:id/analyze    On-demand LLM analysis for one escalation
 *   POST   /api/drift/incidents/:id/remediate  Start Temporal remediation for all affected tenants
 *   POST   /api/drift/ingest                   Submit a schema for comparison (SQL DDL / OpenAPI / CSV / Avro / SOAP)
 *   POST   /api/drift/baseline                 Capture / overwrite baseline for a source
 *   GET    /api/drift/baselines                List all baselines
 */

import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { driftService, driftEventEmitter } from '../platform/drift-service.js';
import { getDriftIncident, listDriftIncidents, saveDriftLlmAnalysis, updateDriftIncidentStatus, type DriftProtocol } from '../store/drift-store.js';
import { listTenantsByConnector } from '../store/tenant-connectors.js';
import { TemporalClientService } from '@integrax/temporal-workflows';
import { createLogger } from '@integrax/logger';

const logger = createLogger({ service: 'drift-routes' });

// ─── Rate limiter for /analyze — prevents accidental Anthropic cost spikes ────
// Simple in-memory token bucket: 20 calls per user per 60-second window.
// Not distributed — sufficient for a single control-plane instance (MVP).

const ANALYZE_WINDOW_MS = 60_000;
const ANALYZE_MAX       = 20;

const analyzeRateMap = new Map<string, { count: number; windowStart: number }>();

function checkAnalyzeRateLimit(userId: string): { allowed: boolean; retryAfterMs: number } {
  const now    = Date.now();
  const bucket = analyzeRateMap.get(userId);

  if (!bucket || now - bucket.windowStart >= ANALYZE_WINDOW_MS) {
    analyzeRateMap.set(userId, { count: 1, windowStart: now });
    return { allowed: true, retryAfterMs: 0 };
  }

  if (bucket.count >= ANALYZE_MAX) {
    const retryAfterMs = ANALYZE_WINDOW_MS - (now - bucket.windowStart);
    return { allowed: false, retryAfterMs };
  }

  bucket.count += 1;
  return { allowed: true, retryAfterMs: 0 };
}

// Lazy singleton — only connects if TEMPORAL_ADDRESS is set
let _temporalPromise: Promise<TemporalClientService | null> | null = null;
function getTemporalClient(): Promise<TemporalClientService | null> {
  if (!process.env.TEMPORAL_ADDRESS) return Promise.resolve(null);
  if (!_temporalPromise) {
    _temporalPromise = (async () => {
      const c = new TemporalClientService();
      await c.connect();
      return c;
    })().catch(() => { _temporalPromise = null; return null; });
  }
  return _temporalPromise;
}

export const driftRouter = Router();

// ─── SSE stream — real-time incident push ─────────────────────────────────────
//
// Clients connect once and receive events as they happen, no polling needed.
// Uses fetch-based SSE (not EventSource) so Bearer auth works normally.
// Each incident.created / incident.updated emits one SSE event.
// A heartbeat comment is sent every 25s to keep proxies from closing the socket.

driftRouter.get(
  '/stream',
  requireAuth,
  requireRole('platform_admin', 'tenant_admin', 'operator', 'viewer'),
  (req, res) => {
    res.setHeader('Content-Type',  'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection',    'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // disable nginx buffering
    res.flushHeaders();

    // Send connected confirmation
    res.write('event: connected\ndata: {"connected":true}\n\n');

    const sendEvent = (event: string, data: unknown) => {
      if (res.writableEnded) return;
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    const onCreated = (incident: unknown) => sendEvent('incident.created', incident);
    const onUpdated = (incident: unknown) => sendEvent('incident.updated', incident);

    driftEventEmitter.on('incident.created', onCreated);
    driftEventEmitter.on('incident.updated', onUpdated);

    // Heartbeat every 25s — prevents proxies / load-balancers from closing idle connections
    const heartbeat = setInterval(() => {
      if (!res.writableEnded) res.write(': heartbeat\n\n');
    }, 25_000);

    req.on('close', () => {
      clearInterval(heartbeat);
      driftEventEmitter.off('incident.created', onCreated);
      driftEventEmitter.off('incident.updated', onUpdated);
    });
  },
);

// ─── List incidents ────────────────────────────────────────────────────────────

driftRouter.get(
  '/incidents',
  requireAuth,
  requireRole('platform_admin', 'tenant_admin', 'operator', 'viewer'),
  async (req, res, _next) => {
    try {
      const status   = req.query['status']   ? (req.query['status']   as string).split(',') as any[] : undefined;
      const protocol = req.query['protocol'] ? (req.query['protocol'] as string).split(',') as any[] : undefined;
      const severity = req.query['severity'] ? (req.query['severity'] as string).split(',') as any[] : undefined;
      const sourceId = req.query['sourceId'] as string | undefined;
      const limit    = req.query['limit']  ? Number(req.query['limit'])  : 50;
      const offset   = req.query['offset'] ? Number(req.query['offset']) : 0;

      const incidents = await listDriftIncidents({ status, protocol, severity, sourceId, limit, offset });
      res.json({ success: true, data: incidents });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[drift/incidents] ERROR:', msg);
      res.status(500).json({ success: false, error: msg });
    }
  },
);

// ─── Single incident ──────────────────────────────────────────────────────────

driftRouter.get(
  '/incidents/:id',
  requireAuth,
  requireRole('platform_admin', 'tenant_admin', 'operator', 'viewer'),
  async (req, res, next) => {
    try {
      const incident = await getDriftIncident(req.params['id']);
      if (!incident) return res.status(404).json({ success: false, error: 'Incident not found' });
      res.json({ success: true, data: incident });
    } catch (err) {
      next(err);
    }
  },
);

// ─── Update status ────────────────────────────────────────────────────────────

driftRouter.post(
  '/incidents/:id/status',
  requireAuth,
  requireRole('platform_admin', 'tenant_admin', 'operator'),
  async (req, res, next) => {
    try {
      const { status } = req.body as { status: string };
      const allowed = ['open', 'investigating', 'resolved', 'dismissed'];
      if (!allowed.includes(status)) {
        return res.status(400).json({ success: false, error: `status must be one of: ${allowed.join(', ')}` });
      }
      await driftService.updateStatus(req.params['id'], status as any);
      res.json({ success: true, id: req.params['id'], status });
    } catch (err) {
      next(err);
    }
  },
);

// ─── Analyze a single LLM escalation with Claude ─────────────────────────────
//
// Takes the pre-built promptSeed stored in the BridgeReport and sends it to
// Claude Haiku. Returns a structured recommendation so the operator doesn't
// have to copy-paste the prompt anywhere.
//
// Rate-limited: 20 req/min per user to avoid accidental Anthropic cost spikes.

driftRouter.post(
  '/incidents/:id/analyze',
  requireAuth,
  requireRole('platform_admin', 'tenant_admin', 'operator'),
  async (req, res, _next) => {
    try {
      // Enforce rate limit before any DB or LLM work
      const userId = (req as any).user?.id ?? (req as any).user?.sub ?? req.ip ?? 'anonymous';
      const { allowed, retryAfterMs } = checkAnalyzeRateLimit(userId);
      if (!allowed) {
        res.setHeader('Retry-After', String(Math.ceil(retryAfterMs / 1000)));
        return res.status(429).json({
          success: false,
          error: `Rate limit exceeded — max ${ANALYZE_MAX} LLM calls per minute. Retry in ${Math.ceil(retryAfterMs / 1000)}s.`,
        });
      }

      const { escalationIndex, locale } = req.body as { escalationIndex: number; locale?: string };

      if (typeof escalationIndex !== 'number') {
        return res.status(400).json({ success: false, error: 'escalationIndex (number) is required' });
      }

      const incident = await getDriftIncident(req.params['id']);
      if (!incident) return res.status(404).json({ success: false, error: 'Incident not found' });

      const escalations = (incident.bridgeReport as any)?.requirementsReport?.llmEscalations ?? [];
      const escalation  = escalations[escalationIndex] as { promptSeed?: string; reason?: string } | undefined;

      if (!escalation?.promptSeed) {
        return res.status(404).json({ success: false, error: 'Escalation or promptSeed not found at that index' });
      }

      if (!process.env.ANTHROPIC_API_KEY) {
        return res.status(503).json({
          success: false,
          error: 'LLM analysis unavailable: add ANTHROPIC_API_KEY to services/control-plane/.env and restart',
          code: 'MISSING_API_KEY',
        });
      }

      // Dynamic import keeps the control-plane startable even without the SDK installed
      let sdk: any;
      try {
        sdk = await import('@anthropic-ai/sdk');
      } catch {
        return res.status(503).json({
          success: false,
          error: 'LLM analysis unavailable: run `pnpm add @anthropic-ai/sdk` in services/control-plane',
          code: 'MISSING_SDK',
        });
      }

      const client = new sdk.default({ apiKey: process.env.ANTHROPIC_API_KEY });

      const LOCALE_NAMES: Record<string, string> = {
        es: 'Spanish', en: 'English', pt: 'Portuguese',
        fr: 'French',  de: 'German',  zh: 'Chinese',
      };
      const langName = LOCALE_NAMES[locale ?? 'en'] ?? 'English';

      const systemPrompt = `You are an assistant helping operators understand API schema changes.
Write in ${langName}, using plain and direct language — no technical jargon.
Do not use terms like "System A", "System B", "stakeholders", "downstream", "coercion", or internal identifiers.
Refer to the two schema versions simply as "the previous version" and "the current version".
Respond with valid JSON only — no markdown, no text outside the JSON.`;

      const userPrompt = `${escalation.promptSeed}

Respond with exactly this JSON shape (no markdown, no extra text):
{
  "action": "renamed_to" | "truly_removed" | "type_changed" | "moved_to_nested" | "needs_investigation",
  "suggestion": "<one-sentence recommendation, in ${langName}>",
  "confidence": <0.0–1.0>,
  "reasoning": "<two-sentence max explanation, in ${langName}>"
}`;

      const message = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 256,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      });

      const rawText: string = message.content[0]?.type === 'text' ? message.content[0].text : '';
      let analysis: unknown;
      try {
        const jsonMatch = rawText.match(/\{[\s\S]*\}/);
        analysis = jsonMatch ? JSON.parse(jsonMatch[0]) : { action: 'needs_investigation', suggestion: rawText, confidence: 0.5, reasoning: rawText };
      } catch {
        analysis = { action: 'needs_investigation', suggestion: rawText, confidence: 0.5, reasoning: rawText };
      }

      // Persist result so the UI can show it without re-calling the LLM
      await saveDriftLlmAnalysis(req.params['id'], {
        ...(analysis as any),
        escalationIndex,
        analyzedAt: new Date().toISOString(),
      });

      res.json({ success: true, data: analysis });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const status = (err as any)?.status ?? (err as any)?.statusCode ?? 500;
      if (status === 401) {
        return res.status(503).json({ success: false, error: 'ANTHROPIC_API_KEY inválida o expirada' });
      }
      if (status === 429) {
        return res.status(503).json({ success: false, error: 'Rate limit de Anthropic — reintentá en unos segundos' });
      }
      console.error('[drift/analyze] LLM error:', msg);
      return res.status(500).json({ success: false, error: `LLM call failed: ${msg}` });
    }
  },
);

// ─── Start Temporal remediation ───────────────────────────────────────────────

driftRouter.post(
  '/incidents/:id/remediate',
  requireAuth,
  requireRole('platform_admin', 'tenant_admin'),
  async (req, res, next) => {
    try {
      const incident = await getDriftIncident(req.params['id']);
      if (!incident) {
        return res.status(404).json({ success: false, error: 'Incident not found' });
      }
      if (!incident.affectedTenants.length) {
        return res.status(400).json({ success: false, error: 'No affected tenants — set connectorId on ingest to compute blast radius' });
      }

      const temporal = await getTemporalClient();
      if (!temporal) {
        return res.status(503).json({ success: false, error: 'Temporal is not configured (TEMPORAL_ADDRESS missing)' });
      }

      const startResults = await Promise.allSettled(
        incident.affectedTenants.map(tenantId => temporal.startRemediation(tenantId)),
      );
      const started = startResults.filter(r => r.status === 'fulfilled').length;
      const failed  = startResults.filter(r => r.status === 'rejected').length;

      if (started > 0) {
        // Move incident to 'investigating' immediately so the operator knows work is in progress
        await updateDriftIncidentStatus(incident.id, 'investigating');

        // Wait for all started workflows in background — auto-resolve if all succeed
        const handles = startResults
          .filter((r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof temporal.startRemediation>>> => r.status === 'fulfilled')
          .map(r => r.value);

        const incidentId = incident.id;
        const resolveWhenDone = async () => {
          try {
            const outcomes = await Promise.allSettled(handles.map(h => h.result()));
            const allOk = outcomes.every(
              o => o.status === 'fulfilled' && (o.value as any)?.success === true,
            );
            if (allOk) {
              await updateDriftIncidentStatus(incidentId, 'resolved');
              logger.info({ incidentId }, 'Remediation complete — incident auto-resolved');
            } else {
              logger.warn({ incidentId }, 'One or more remediation workflows failed — incident left in investigating');
            }
          } catch (err) {
            logger.warn({ err, incidentId }, 'Error awaiting remediation outcomes');
          }
        };
        void resolveWhenDone();
      }

      res.json({ success: true, data: { started, failed, total: incident.affectedTenants.length } });
    } catch (err) {
      next(err);
    }
  },
);

// ─── Ingest schema for comparison ─────────────────────────────────────────────

driftRouter.post(
  '/ingest',
  requireAuth,
  requireRole('platform_admin', 'tenant_admin', 'operator'),
  async (req, res, next) => {
    try {
      const { sourceId, protocol, schema, connectorId } = req.body as {
        sourceId: string;
        protocol: DriftProtocol;
        schema: string;     // DDL, OpenAPI YAML/JSON, CSV, JSONL, XML/SOAP, GraphQL SDL, Parquet schema JSON, .proto
        connectorId?: string;
      };

      if (!sourceId || !protocol || !schema) {
        return res.status(400).json({ success: false, error: 'sourceId, protocol, and schema are required' });
      }

      // Compute blast radius if connectorId is provided
      const affectedTenants = connectorId ? await listTenantsByConnector(connectorId) : [];

      const incident = await driftService.ingest(sourceId, protocol, schema, affectedTenants);

      if (!incident) {
        return res.json({ success: true, data: null, message: 'No drift detected' });
      }

      res.status(201).json({ success: true, data: incident });
    } catch (err) {
      next(err);
    }
  },
);

// ─── Capture baseline ─────────────────────────────────────────────────────────

driftRouter.post(
  '/baseline',
  requireAuth,
  requireRole('platform_admin', 'tenant_admin'),
  async (req, res, next) => {
    try {
      const { sourceId, protocol, schema } = req.body as {
        sourceId: string;
        protocol: DriftProtocol;
        schema: string;
      };

      if (!sourceId || !protocol || !schema) {
        return res.status(400).json({ success: false, error: 'sourceId, protocol, and schema are required' });
      }

      const resolved = await driftService.captureBaseline(sourceId, protocol, schema);
      res.json({
        success: true,
        message: `Baseline captured for ${sourceId} (${protocol})`,
        data: { resolved },
      });
    } catch (err) {
      next(err);
    }
  },
);

// ─── List baselines ───────────────────────────────────────────────────────────

driftRouter.get(
  '/baselines',
  requireAuth,
  requireRole('platform_admin', 'tenant_admin', 'operator', 'viewer'),
  async (req, res, next) => {
    try {
      const baselines = await driftService.listBaselines();
      res.json({ success: true, data: baselines });
    } catch (err) {
      next(err);
    }
  },
);
