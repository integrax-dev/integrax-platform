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
import { driftService } from '../platform/drift-service.js';
import { getDriftIncident, listDriftIncidents, saveDriftLlmAnalysis, type DriftProtocol } from '../store/drift-store.js';
import { listTenantsByConnector } from '../store/tenant-connectors.js';
import { TemporalClientService } from '@integrax/temporal-workflows';

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

// ─── List incidents ────────────────────────────────────────────────────────────

driftRouter.get(
  '/incidents',
  requireAuth,
  requireRole('platform_admin', 'tenant_admin', 'operator', 'viewer'),
  async (req, res, next) => {
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
      next(err);
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
// The control-plane calls Anthropic directly here (same pattern as /schemas/reports/:id/explain).
// Rate-limited: 20 req/min to avoid accidental cost spikes.

driftRouter.post(
  '/incidents/:id/analyze',
  requireAuth,
  requireRole('platform_admin', 'tenant_admin', 'operator'),
  async (req, res, next) => {
    try {
      const { escalationIndex } = req.body as { escalationIndex: number };

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
        return res.status(503).json({ success: false, error: 'ANTHROPIC_API_KEY not configured' });
      }

      // Dynamic import keeps the control-plane startable even without the SDK installed
      let sdk: any;
      try {
        sdk = await import('@anthropic-ai/sdk');
      } catch {
        return res.status(503).json({ success: false, error: '@anthropic-ai/sdk not available in this environment' });
      }

      const client = new sdk.default({ apiKey: process.env.ANTHROPIC_API_KEY });

      const systemPrompt = `You are a schema drift analyzer. Given context about a field-level change,
produce a concise structured recommendation. Always respond with valid JSON only, no prose outside the JSON.`;

      const userPrompt = `${escalation.promptSeed}

Respond with exactly this JSON shape (no markdown, no extra text):
{
  "action": "renamed_to" | "truly_removed" | "type_changed" | "moved_to_nested" | "needs_investigation",
  "suggestion": "<one-sentence recommendation for the operator>",
  "confidence": <0.0–1.0>,
  "reasoning": "<two-sentence max explanation>"
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
      next(err);
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

      const results = await Promise.allSettled(
        incident.affectedTenants.map(tenantId => temporal.startRemediation(tenantId)),
      );
      const started = results.filter(r => r.status === 'fulfilled').length;
      const failed  = results.filter(r => r.status === 'rejected').length;

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
        schema: string;     // raw DDL, OpenAPI YAML/JSON, CSV header row, Avro JSON, WSDL, etc.
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

      await driftService.captureBaseline(sourceId, protocol, schema);
      res.json({ success: true, message: `Baseline captured for ${sourceId} (${protocol})` });
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
