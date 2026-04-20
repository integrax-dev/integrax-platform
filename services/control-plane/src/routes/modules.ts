/**
 * Module provisioning routes  /api/tenants/:tenantId/modules
 *
 * Manages per-tenant module configuration (e.g. wiring Medusa into the ecommerce module).
 * Writes require platform_admin or tenant_admin. Reads accept viewer.
 */

import { Router } from 'express';
import { ulid } from 'ulid';
import { requireAuth, requireRole } from '../middleware/auth.js';
import {
  findTenantModuleConfig,
  listTenantModuleConfigs,
  saveTenantModuleConfig,
  deleteTenantModuleConfig,
} from '../store/tenant-module-config.js';
import { evictModule } from '../platform/module-eviction-registry.js';
import { testModule } from '../platform/module-tester-registry.js';

export const modulesRouter = Router();

// ─── List all module configs for a tenant ────────────────────────────────────

modulesRouter.get(
  '/:tenantId/modules',
  requireAuth,
  requireRole('platform_admin', 'tenant_admin', 'operator', 'viewer'),
  async (req, res, next) => {
    try {
      const configs = await listTenantModuleConfigs(req.params['tenantId']);
      res.json({ success: true, data: configs });
    } catch (err) {
      next(err);
    }
  },
);

// ─── Get a specific module config ────────────────────────────────────────────

modulesRouter.get(
  '/:tenantId/modules/:moduleId',
  requireAuth,
  requireRole('platform_admin', 'tenant_admin', 'operator', 'viewer'),
  async (req, res, next) => {
    try {
      const cfg = await findTenantModuleConfig(req.params['tenantId'], req.params['moduleId']);
      if (!cfg) return res.status(404).json({ success: false, error: 'Module config not found' });
      res.json({ success: true, data: cfg });
    } catch (err) {
      next(err);
    }
  },
);

// ─── Configure / activate a module ───────────────────────────────────────────

modulesRouter.put(
  '/:tenantId/modules/:moduleId',
  requireAuth,
  requireRole('platform_admin', 'tenant_admin'),
  async (req, res, next) => {
    try {
      const { tenantId, moduleId } = req.params as { tenantId: string; moduleId: string };
      const existing = await findTenantModuleConfig(tenantId, moduleId);
      const now = new Date();

      await saveTenantModuleConfig({
        id: existing?.id ?? ulid(),
        tenantId,
        moduleId,
        status: 'active',
        config: req.body as Record<string, string>,
        enabledAt: existing?.enabledAt ?? now,
        updatedAt: now,
      });

      evictModule(moduleId, tenantId);

      const saved = await findTenantModuleConfig(tenantId, moduleId);
      res.json({ success: true, data: saved });
    } catch (err) {
      next(err);
    }
  },
);

// ─── Disable a module ─────────────────────────────────────────────────────────

modulesRouter.delete(
  '/:tenantId/modules/:moduleId',
  requireAuth,
  requireRole('platform_admin', 'tenant_admin'),
  async (req, res, next) => {
    try {
      const { tenantId, moduleId } = req.params as { tenantId: string; moduleId: string };
      await deleteTenantModuleConfig(tenantId, moduleId);
      evictModule(moduleId, tenantId);
      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  },
);

// ─── Test module connectivity (generic — works for any module with a registered tester) ──

modulesRouter.post(
  '/:tenantId/modules/:moduleId/test',
  requireAuth,
  requireRole('platform_admin', 'tenant_admin'),
  async (req, res, next) => {
    try {
      const { tenantId, moduleId } = req.params as { tenantId: string; moduleId: string };
      const cfg = await findTenantModuleConfig(tenantId, moduleId);
      if (!cfg || cfg.status !== 'active') {
        return res.status(400).json({ success: false, error: `Module '${moduleId}' not configured` });
      }
      const result = await testModule(moduleId, cfg.config);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },
);
