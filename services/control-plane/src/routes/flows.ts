/**
 * Flows routes
 *
 * /api/tenants/:tenantId/flow-mappings  — per-tenant event→flow mappings (Postgres)
 * /api/tenants/:tenantId/flows          — proxy to Activepieces (list, trigger, enable, disable)
 * /api/tenants/:tenantId/flows/runs     — proxy to Activepieces (status, cancel)
 */

import { Router } from 'express';
import { ulid } from 'ulid';
import { requireAuth, requireRole } from '../middleware/auth.js';
import {
  listFlowMappings,
  getFlowMapping,
  saveFlowMapping,
  deleteFlowMapping,
} from '../store/tenant-flow-mappings.js';
import { ActivepiecesAdapter } from '@integrax/integration-engine';

export const flowsRouter = Router({ mergeParams: true });

// ─── Activepieces adapter (optional — only active when env vars are set) ───────

function getAdapter(): ActivepiecesAdapter | null {
  const url = process.env.ACTIVEPIECES_BASE_URL;
  const key = process.env.ACTIVEPIECES_API_KEY;
  if (!url || !key) return null;
  return new ActivepiecesAdapter(url, key);
}

// ─── Flow mappings (event_type → flow_id) ──────────────────────────────────────

flowsRouter.get(
  '/flow-mappings',
  requireAuth,
  requireRole('platform_admin', 'tenant_admin', 'operator', 'viewer'),
  async (req, res, next) => {
    try {
      const mappings = await listFlowMappings(req.params['tenantId']);
      res.json({ success: true, data: mappings });
    } catch (err) { next(err); }
  },
);

flowsRouter.get(
  '/flow-mappings/:eventType',
  requireAuth,
  requireRole('platform_admin', 'tenant_admin', 'operator', 'viewer'),
  async (req, res, next) => {
    try {
      const m = await getFlowMapping(req.params['tenantId'], req.params['eventType']);
      if (!m) return res.status(404).json({ success: false, error: 'Mapping not found' });
      res.json({ success: true, data: m });
    } catch (err) { next(err); }
  },
);

flowsRouter.put(
  '/flow-mappings/:eventType',
  requireAuth,
  requireRole('platform_admin', 'tenant_admin'),
  async (req, res, next) => {
    try {
      const { tenantId, eventType } = req.params as { tenantId: string; eventType: string };
      const { flowId, enabled = true } = req.body as { flowId?: string; enabled?: boolean };
      if (!flowId) return res.status(400).json({ success: false, error: 'flowId is required' });

      const existing = await getFlowMapping(tenantId, eventType);
      const now = new Date();
      await saveFlowMapping({
        id: existing?.id ?? ulid(),
        tenantId, eventType, flowId, enabled,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      });
      res.json({ success: true, data: await getFlowMapping(tenantId, eventType) });
    } catch (err) { next(err); }
  },
);

flowsRouter.delete(
  '/flow-mappings/:eventType',
  requireAuth,
  requireRole('platform_admin', 'tenant_admin'),
  async (req, res, next) => {
    try {
      await deleteFlowMapping(req.params['tenantId'], req.params['eventType']);
      res.json({ success: true });
    } catch (err) { next(err); }
  },
);

// ─── Activepieces flow management ──────────────────────────────────────────────

// GET /api/tenants/:tenantId/flows — list all flows for tenant
flowsRouter.get(
  '/flows',
  requireAuth,
  requireRole('platform_admin', 'tenant_admin', 'operator', 'viewer'),
  async (req, res, next) => {
    try {
      const adapter = getAdapter();
      if (!adapter) return res.status(503).json({ success: false, error: 'Activepieces not configured' });
      const flows = await adapter.listFlows(req.params['tenantId']);
      res.json({ success: true, data: flows });
    } catch (err) { next(err); }
  },
);

// POST /api/tenants/:tenantId/flows/:flowId/trigger — manually trigger a flow
flowsRouter.post(
  '/flows/:flowId/trigger',
  requireAuth,
  requireRole('platform_admin', 'tenant_admin', 'operator'),
  async (req, res, next) => {
    try {
      const adapter = getAdapter();
      if (!adapter) return res.status(503).json({ success: false, error: 'Activepieces not configured' });
      const { tenantId, flowId } = req.params as { tenantId: string; flowId: string };
      const result = await adapter.triggerFlow({ flowId, tenantId, payload: req.body ?? {} });
      res.json({ success: true, data: result });
    } catch (err) { next(err); }
  },
);

// PATCH /api/tenants/:tenantId/flows/:flowId — enable or disable a flow
flowsRouter.patch(
  '/flows/:flowId',
  requireAuth,
  requireRole('platform_admin', 'tenant_admin'),
  async (req, res, next) => {
    try {
      const adapter = getAdapter();
      if (!adapter) return res.status(503).json({ success: false, error: 'Activepieces not configured' });
      const { tenantId, flowId } = req.params as { tenantId: string; flowId: string };
      const { enabled } = req.body as { enabled?: boolean };
      if (typeof enabled !== 'boolean') {
        return res.status(400).json({ success: false, error: 'enabled (boolean) is required' });
      }
      if (enabled) {
        await adapter.enableFlow(tenantId, flowId);
      } else {
        await adapter.disableFlow(tenantId, flowId);
      }
      res.json({ success: true });
    } catch (err) { next(err); }
  },
);

// GET /api/tenants/:tenantId/flows/runs/:runId — get run status
flowsRouter.get(
  '/flows/runs/:runId',
  requireAuth,
  requireRole('platform_admin', 'tenant_admin', 'operator', 'viewer'),
  async (req, res, next) => {
    try {
      const adapter = getAdapter();
      if (!adapter) return res.status(503).json({ success: false, error: 'Activepieces not configured' });
      const { tenantId, runId } = req.params as { tenantId: string; runId: string };
      const run = await adapter.getRunStatus(tenantId, runId);
      res.json({ success: true, data: run });
    } catch (err) { next(err); }
  },
);

// POST /api/tenants/:tenantId/flows/runs/:runId/cancel — cancel a running flow
flowsRouter.post(
  '/flows/runs/:runId/cancel',
  requireAuth,
  requireRole('platform_admin', 'tenant_admin', 'operator'),
  async (req, res, next) => {
    try {
      const adapter = getAdapter();
      if (!adapter) return res.status(503).json({ success: false, error: 'Activepieces not configured' });
      const { tenantId, runId } = req.params as { tenantId: string; runId: string };
      await adapter.cancelRun(tenantId, runId);
      res.json({ success: true });
    } catch (err) { next(err); }
  },
);
