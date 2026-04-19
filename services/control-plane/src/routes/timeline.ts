/**
 * Timeline routes
 *
 * GET  /api/tenants/:tenantId/timeline          — lista entradas con filtros opcionales
 * GET  /api/tenants/:tenantId/timeline/:id      — entrada individual
 * POST /api/tenants/:tenantId/timeline/:id/resolve — resuelve un conflicto
 */

import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { timelineStore } from '../platform/container.js';
import type { TimelineKind } from '@integrax/timeline';

export const timelineRouter = Router();

// GET /api/tenants/:tenantId/timeline
timelineRouter.get(
  '/:tenantId/timeline',
  requireAuth,
  requireRole('platform_admin', 'tenant_admin', 'operator', 'viewer'),
  async (req, res, next) => {
    try {
      const { tenantId } = req.params;
      const q = req.query;

      const entries = await timelineStore.list(tenantId, {
        kind: q['kind'] as TimelineKind | TimelineKind[] | undefined,
        entityType: q['entityType'] as string | undefined,
        canonicalId: q['canonicalId'] as string | undefined,
        sourceSystem: q['sourceSystem'] as string | undefined,
        severity: q['severity']
          ? (q['severity'] as string).split(',') as Array<'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'>
          : undefined,
        from: q['from'] ? new Date(q['from'] as string) : undefined,
        to: q['to'] ? new Date(q['to'] as string) : undefined,
        limit: q['limit'] ? Number(q['limit']) : undefined,
        after: q['after'] as string | undefined,
      });

      res.json({ success: true, data: entries });
    } catch (err) {
      next(err);
    }
  },
);

// GET /api/tenants/:tenantId/timeline/:id
timelineRouter.get(
  '/:tenantId/timeline/:id',
  requireAuth,
  requireRole('platform_admin', 'tenant_admin', 'operator', 'viewer'),
  async (req, res, next) => {
    try {
      const entry = await timelineStore.get(req.params['tenantId'], req.params['id']);
      if (!entry) {
        res.status(404).json({ error: 'NOT_FOUND', message: 'Entrada de timeline no encontrada' });
        return;
      }
      res.json({ success: true, data: entry });
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/tenants/:tenantId/timeline/:id/resolve
timelineRouter.post(
  '/:tenantId/timeline/:id/resolve',
  requireAuth,
  requireRole('platform_admin', 'tenant_admin', 'operator'),
  async (req, res, next) => {
    try {
      const { tenantId, id } = req.params;
      const { status, resolvedBy, resolution } = req.body;

      const updated = await timelineStore.resolveConflict(tenantId, id, {
        status: status ?? 'resolved',
        resolvedAt: new Date(),
        resolvedBy,
        resolution,
      });

      res.json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  },
);
