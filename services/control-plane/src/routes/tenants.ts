/**
 * Rutas de la API de gestión de tenants
 */

import { Router, Request, Response } from 'express';
import { ulid } from 'ulid';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import {
  Tenant,
  CreateTenantSchema,
  TenantLimitsSchema,
  TenantStatus,
  TenantPlan,
} from '../types.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { audit } from '../middleware/audit.js';
import { validate } from '../middleware/validate.js';
import { getTenant, saveTenant, listTenants } from '../store/tenants.js';

const router: Router = Router();

// Límites por defecto según el plan
const PLAN_LIMITS: Record<TenantPlan, typeof TenantLimitsSchema._type> = {
  free: {
    requestsPerMinute: 30,
    jobsPerMinute: 50,
    maxConcurrentJobs: 5,
    maxWorkflows: 3,
    maxConnectors: 3,
    dataRetentionDays: 7,
  },
  starter: {
    requestsPerMinute: 100,
    jobsPerMinute: 200,
    maxConcurrentJobs: 10,
    maxWorkflows: 10,
    maxConnectors: 5,
    dataRetentionDays: 30,
  },
  professional: {
    requestsPerMinute: 500,
    jobsPerMinute: 1000,
    maxConcurrentJobs: 50,
    maxWorkflows: 50,
    maxConnectors: 20,
    dataRetentionDays: 90,
  },
  enterprise: {
    requestsPerMinute: 5000,
    jobsPerMinute: 10000,
    maxConcurrentJobs: 200,
    maxWorkflows: 500,
    maxConnectors: 100,
    dataRetentionDays: 365,
  },
};

/**
 * POST /tenants - Crea un nuevo tenant
 */
router.post(
  '/',
  requireAuth,
  requireRole('platform_admin'),
  validate(CreateTenantSchema),
  audit('tenant.create'),
  async (req: Request, res: Response) => {
    const input = req.body;

    const tenantId = `ten_${ulid()}`;
    const apiKey = `ixk_${randomBytes(32).toString('hex')}`;
    const webhookSecret = `whsec_${randomBytes(32).toString('hex')}`;
    const ownerId = `usr_${ulid()}`;

    const tenant: Tenant = {
      id: tenantId,
      name: input.name,
      plan: input.plan,
      status: 'active',
      ownerId,
      limits: input.limits || PLAN_LIMITS[input.plan as TenantPlan],
      metadata: input.metadata || {},
      apiKeyHash: await bcrypt.hash(apiKey, 10),
      webhookSecret,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await saveTenant(tenant);

    res.status(201).json({
      success: true,
      data: {
        tenant: { ...tenant, apiKeyHash: undefined },
        apiKey,
        webhookSecret,
      },
    });
  }
);

/**
 * GET /tenants - Lista todos los tenants (solo platform_admin)
 */
router.get(
  '/',
  requireAuth,
  requireRole('platform_admin'),
  async (req: Request, res: Response) => {
    const status = req.query.status as TenantStatus | undefined;
    const plan = req.query.plan as TenantPlan | undefined;

    // Cursor-based pagination (preferred): ?after=<cursor>&limit=20
    // Offset-based pagination (legacy):    ?page=1&pageSize=20
    const after = req.query.after as string | undefined;
    const limitParam = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = parseInt(req.query.pageSize as string) || 20;

    const { data, totalItems, nextCursor } = await listTenants({
      status, plan,
      after, limit: limitParam,
      page, pageSize,
    });

    res.json({
      success: true,
      data,
      pagination: after !== undefined || limitParam !== undefined
        ? { limit: limitParam ?? 20, count: data.length, nextCursor: nextCursor ?? null }
        : { page, pageSize, totalItems, totalPages: Math.ceil(totalItems / pageSize) },
    });
  }
);

/**
 * GET /tenants/:id - Obtiene los detalles de un tenant
 */
router.get(
  '/:id',
  requireAuth,
  requireRole('platform_admin', 'tenant_admin'),
  async (req: Request, res: Response) => {
    const tenant = await getTenant(req.params.id);

    if (!tenant) {
      return res.status(404).json({
        success: false,
        error: { code: 'TENANT_NOT_FOUND', message: 'Tenant not found' },
      });
    }

    if (req.user?.role === 'tenant_admin' && req.user?.tenantId !== tenant.id) {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Access denied' },
      });
    }

    res.json({
      success: true,
      data: { ...tenant, apiKeyHash: undefined },
    });
  }
);

/**
 * PATCH /tenants/:id - Actualiza un tenant
 */
router.patch(
  '/:id',
  requireAuth,
  requireRole('platform_admin'),
  audit('tenant.update'),
  async (req: Request, res: Response) => {
    const tenant = await getTenant(req.params.id);

    if (!tenant) {
      return res.status(404).json({
        success: false,
        error: { code: 'TENANT_NOT_FOUND', message: 'Tenant not found' },
      });
    }

    const updates = req.body;

    if (updates.name) tenant.name = updates.name;
    if (updates.plan) {
      tenant.plan = updates.plan;
      if (!updates.limits) {
        tenant.limits = PLAN_LIMITS[updates.plan as TenantPlan];
      }
    }
    if (updates.limits) {
      tenant.limits = { ...tenant.limits, ...updates.limits };
    }
    if (updates.metadata) {
      tenant.metadata = { ...tenant.metadata, ...updates.metadata };
    }

    tenant.updatedAt = new Date();
    await saveTenant(tenant);

    res.json({
      success: true,
      data: { ...tenant, apiKeyHash: undefined },
    });
  }
);

/**
 * POST /tenants/:id/suspend - Suspende un tenant
 */
router.post(
  '/:id/suspend',
  requireAuth,
  requireRole('platform_admin'),
  audit('tenant.suspend'),
  async (req: Request, res: Response) => {
    const tenant = await getTenant(req.params.id);

    if (!tenant) {
      return res.status(404).json({
        success: false,
        error: { code: 'TENANT_NOT_FOUND', message: 'Tenant not found' },
      });
    }

    tenant.status = 'suspended';
    tenant.updatedAt = new Date();
    await saveTenant(tenant);

    res.json({
      success: true,
      data: { ...tenant, apiKeyHash: undefined },
    });
  }
);

/**
 * POST /tenants/:id/resume - Reactiva un tenant suspendido
 */
router.post(
  '/:id/resume',
  requireAuth,
  requireRole('platform_admin'),
  audit('tenant.resume'),
  async (req: Request, res: Response) => {
    const tenant = await getTenant(req.params.id);

    if (!tenant) {
      return res.status(404).json({
        success: false,
        error: { code: 'TENANT_NOT_FOUND', message: 'Tenant not found' },
      });
    }

    tenant.status = 'active';
    tenant.updatedAt = new Date();
    await saveTenant(tenant);

    res.json({
      success: true,
      data: { ...tenant, apiKeyHash: undefined },
    });
  }
);

/**
 * POST /tenants/:id/rotate-api-key - Rota la API key del tenant
 */
router.post(
  '/:id/rotate-api-key',
  requireAuth,
  requireRole('platform_admin', 'tenant_admin'),
  audit('tenant.rotate_api_key'),
  async (req: Request, res: Response) => {
    const tenant = await getTenant(req.params.id);

    if (!tenant) {
      return res.status(404).json({
        success: false,
        error: { code: 'TENANT_NOT_FOUND', message: 'Tenant not found' },
      });
    }

    if (req.user?.role === 'tenant_admin' && req.user?.tenantId !== tenant.id) {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Access denied' },
      });
    }

    const newApiKey = `ixk_${randomBytes(32).toString('hex')}`;
    tenant.apiKeyHash = await bcrypt.hash(newApiKey, 10);
    tenant.updatedAt = new Date();
    await saveTenant(tenant);

    res.json({
      success: true,
      data: {
        apiKey: newApiKey,
        message: 'API key rotated successfully. Store the new key securely.',
      },
    });
  }
);

/**
 * DELETE /tenants/:id - Cancela un tenant (soft delete)
 */
router.delete(
  '/:id',
  requireAuth,
  requireRole('platform_admin'),
  audit('tenant.delete'),
  async (req: Request, res: Response) => {
    const tenant = await getTenant(req.params.id);

    if (!tenant) {
      return res.status(404).json({
        success: false,
        error: { code: 'TENANT_NOT_FOUND', message: 'Tenant not found' },
      });
    }

    tenant.status = 'cancelled';
    tenant.updatedAt = new Date();
    await saveTenant(tenant);

    res.json({
      success: true,
      data: { message: 'Tenant cancelled. Data will be deleted per retention policy.' },
    });
  }
);

export { router as tenantsRouter };
