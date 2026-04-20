/**
 * Flow mapping routes  /api/tenants/:tenantId/flow-mappings
 *
 * CRUD for per-tenant Activepieces event→flow mappings.
 * Writes require tenant_admin+. Reads accept viewer.
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

export const flowsRouter = Router({ mergeParams: true });

// GET /api/tenants/:tenantId/flow-mappings
flowsRouter.get(
  '/',
  requireAuth,
  requireRole('platform_admin', 'tenant_admin', 'operator', 'viewer'),
  async (req, res, next) => {
    try {
      const mappings = await listFlowMappings(req.params['tenantId']);
      res.json({ success: true, data: mappings });
    } catch (err) {
      next(err);
    }
  },
);

// GET /api/tenants/:tenantId/flow-mappings/:eventType
flowsRouter.get(
  '/:eventType',
  requireAuth,
  requireRole('platform_admin', 'tenant_admin', 'operator', 'viewer'),
  async (req, res, next) => {
    try {
      const m = await getFlowMapping(req.params['tenantId'], req.params['eventType']);
      if (!m) return res.status(404).json({ success: false, error: 'Mapping not found' });
      res.json({ success: true, data: m });
    } catch (err) {
      next(err);
    }
  },
);

// PUT /api/tenants/:tenantId/flow-mappings/:eventType
flowsRouter.put(
  '/:eventType',
  requireAuth,
  requireRole('platform_admin', 'tenant_admin'),
  async (req, res, next) => {
    try {
      const { tenantId, eventType } = req.params as { tenantId: string; eventType: string };
      const { flowId, enabled = true } = req.body as { flowId?: string; enabled?: boolean };

      if (!flowId) {
        return res.status(400).json({ success: false, error: 'flowId is required' });
      }

      const existing = await getFlowMapping(tenantId, eventType);
      const now = new Date();

      await saveFlowMapping({
        id: existing?.id ?? ulid(),
        tenantId,
        eventType,
        flowId,
        enabled,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      });

      const saved = await getFlowMapping(tenantId, eventType);
      res.json({ success: true, data: saved });
    } catch (err) {
      next(err);
    }
  },
);

// DELETE /api/tenants/:tenantId/flow-mappings/:eventType
flowsRouter.delete(
  '/:eventType',
  requireAuth,
  requireRole('platform_admin', 'tenant_admin'),
  async (req, res, next) => {
    try {
      await deleteFlowMapping(req.params['tenantId'], req.params['eventType']);
      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  },
);
