/**
 * Snapshot routes
 *
 * GET /api/tenants/:tenantId/snapshots/:entityType
 *   — lista los últimos snapshots de un tipo de entidad para el tenant.
 *
 * GET /api/tenants/:tenantId/snapshots/:entityType/:canonicalId
 *   — devuelve el snapshot de una entidad específica.
 */

import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { snapshotStore } from '../platform/container.js';

export const snapshotsRouter = Router({ mergeParams: true });

// GET /api/tenants/:tenantId/snapshots/:entityType
snapshotsRouter.get(
  '/:entityType',
  requireAuth,
  requireRole('platform_admin', 'tenant_admin', 'operator', 'viewer'),
  async (req, res, next) => {
    try {
      const { tenantId, entityType } = req.params;
      const since = req.query['since'] ? new Date(req.query['since'] as string) : undefined;
      const limit = req.query['limit'] ? Number(req.query['limit']) : undefined;
      const sourceSystem = req.query['sourceSystem'] as string | undefined;

      const snapshots = await snapshotStore.list(tenantId, entityType, {
        since,
        limit,
        sourceSystem,
      });

      res.json({ success: true, data: snapshots });
    } catch (err) {
      next(err);
    }
  },
);

// GET /api/tenants/:tenantId/snapshots/:entityType/:canonicalId
snapshotsRouter.get(
  '/:entityType/:canonicalId',
  requireAuth,
  requireRole('platform_admin', 'tenant_admin', 'operator', 'viewer'),
  async (req, res, next) => {
    try {
      const { tenantId, entityType, canonicalId } = req.params;
      const snapshot = await snapshotStore.get(tenantId, entityType, canonicalId);

      if (!snapshot) {
        res.status(404).json({ error: 'NOT_FOUND', message: 'Snapshot no encontrado' });
        return;
      }

      res.json({ success: true, data: snapshot });
    } catch (err) {
      next(err);
    }
  },
);
