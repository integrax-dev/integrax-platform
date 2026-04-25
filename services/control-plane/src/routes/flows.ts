/**
 * Flows routes
 *
 * /api/tenants/:tenantId/flow-mappings  — per-tenant event→flow mappings (Postgres)
 * /api/tenants/:tenantId/flows          — proxy to Activepieces using per-tenant project
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
import { getApSession, invalidateApSession } from '../lib/ap-session.js';
import { ensureApProject } from '../lib/ap-provisioning.js';

export const flowsRouter = Router({ mergeParams: true });

function apBase(): string | null {
  const raw = process.env.ACTIVEPIECES_BASE_URL;
  if (!raw) return null;
  const trimmed = raw.replace(/\/$/, '');
  return trimmed.endsWith('/api') ? trimmed : `${trimmed}/api`;
}

// Admin session token — unchanged. Only projectId changes per tenant.
async function apFetch(path: string, init?: RequestInit): Promise<Response> {
  const session = await getApSession();
  if (!session) throw new Error('Activepieces session unavailable');

  const res = await fetch(`${apBase()}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.token}`,
      ...(init?.headers ?? {}),
    },
    signal: AbortSignal.timeout(10000),
  });

  if (res.status === 401) {
    invalidateApSession();
    const fresh = await getApSession();
    if (!fresh) throw new Error('Activepieces re-auth failed');
    return fetch(`${apBase()}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${fresh.token}`,
        ...(init?.headers ?? {}),
      },
      signal: AbortSignal.timeout(10000),
    });
  }

  return res;
}

// ─── Flow mappings (event_type → flow_id) ─────────────────────────────────────

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

// ─── Activepieces flow management ─────────────────────────────────────────────

flowsRouter.get(
  '/flows',
  requireAuth,
  requireRole('platform_admin', 'tenant_admin', 'operator', 'viewer'),
  async (req, res, next) => {
    try {
      const tenantId = req.params['tenantId'];
      if (!apBase()) return res.status(503).json({ success: false, error: 'Activepieces not configured' });

      const session = await getApSession();
      if (!session) return res.status(503).json({ success: false, error: 'Activepieces unavailable' });

      // Per-tenant project isolation — falls back to admin's default project if provisioning fails
      const projectId = await ensureApProject(tenantId) ?? session.projectId;

      const upstream = await apFetch(`/v1/flows?projectId=${projectId}&limit=100`);
      const body = await upstream.json() as { data?: unknown[] };
      const flows = (body.data ?? []) as Array<{
        id: string; status: string;
        version?: { displayName?: string; trigger?: { type: string; displayName?: string } };
      }>;

      res.json({
        success: true,
        data: flows.map(f => ({
          id: f.id,
          name: f.version?.displayName ?? f.id,
          status: f.status as 'ENABLED' | 'DISABLED',
          publishedVersionId: undefined,
          version: f.version,
        })),
      });
    } catch (err) { next(err); }
  },
);

flowsRouter.patch(
  '/flows/:flowId',
  requireAuth,
  requireRole('platform_admin', 'tenant_admin'),
  async (req, res, next) => {
    try {
      const { flowId } = req.params as { flowId: string };
      if (!apBase()) return res.status(503).json({ success: false, error: 'Activepieces not configured' });
      const { enabled } = req.body as { enabled?: boolean };
      if (typeof enabled !== 'boolean') {
        return res.status(400).json({ success: false, error: 'enabled (boolean) is required' });
      }
      const upstream = await apFetch(`/v1/flows/${flowId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: enabled ? 'ENABLED' : 'DISABLED' }),
      });
      if (!upstream.ok) return res.status(upstream.status).json({ success: false, error: await upstream.text() });
      res.json({ success: true });
    } catch (err) { next(err); }
  },
);

flowsRouter.post(
  '/flows/:flowId/trigger',
  requireAuth,
  requireRole('platform_admin', 'tenant_admin', 'operator'),
  async (req, res, next) => {
    try {
      const { flowId } = req.params as { flowId: string };
      if (!apBase()) return res.status(503).json({ success: false, error: 'Activepieces not configured' });
      const upstream = await apFetch(`/v1/flow-runs`, {
        method: 'POST',
        body: JSON.stringify({ flowId, payload: req.body ?? {} }),
      });
      const body = await upstream.json() as { id?: string };
      res.json({ success: true, data: { runId: body.id } });
    } catch (err) { next(err); }
  },
);
