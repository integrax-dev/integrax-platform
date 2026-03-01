/**
 * Tenant Management API Routes
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

const router: Router = Router();

import { tenants } from '../store/tenants.js';

// Default limits per plan
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
 * POST /tenants - Create a new tenant
 */
router.post(
  '/',
  requireAuth,
  requireRole('platform_admin'),
  validate(CreateTenantSchema),
  audit('tenant.create'),
  async (req, res) => {
    const input = req.body;

    // Generate IDs and secrets
    const tenantId = `ten_${ulid()}`;
    const apiKey = `ixk_${randomBytes(32).toString('hex')}`;
    const webhookSecret = `whsec_${randomBytes(32).toString('hex')}`;

    // Create owner user ID (would be created in users table)
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

    tenants.set(tenantId, tenant);

    res.status(201).json({
      success: true,
      data: {
        tenant: { ...tenant, apiKeyHash: undefined },
        apiKey, // Only returned once on creation
        webhookSecret,
      },
    });
  }
);

/**
 * GET /tenants - List all tenants (platform admin only)
 */
router.get(
  '/',
  requireAuth,
  requireRole('platform_admin'),
  async (req, res) => {
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = parseInt(req.query.pageSize as string) || 20;
    const status = req.query.status as TenantStatus | undefined;
    const plan = req.query.plan as TenantPlan | undefined;

    let allTenants = Array.from(tenants.values());

    // Filter
    if (status) {
      allTenants = allTenants.filter((t) => t.status === status);
    }
    if (plan) {
      allTenants = allTenants.filter((t) => t.plan === plan);
    }

    // Sort by creation date
    allTenants.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    // Paginate
    const start = (page - 1) * pageSize;
    const data = allTenants.slice(start, start + pageSize);

    res.json({
      success: true,
      data,
      pagination: {
        page,
        pageSize,
        totalItems: allTenants.length,
        totalPages: Math.ceil(allTenants.length / pageSize),
      },
    });
  }
);

/**
 * GET /tenants/:id - Get tenant details
 */
router.get(
  '/:id',
  requireAuth,
  requireRole('platform_admin', 'tenant_admin'),
  async (req, res) => {
    const tenant = tenants.get(req.params.id);

    if (!tenant) {
      return res.status(404).json({
        success: false,
        error: { code: 'TENANT_NOT_FOUND', message: 'Tenant not found' },
      });
    }

    // Tenant admins can only see their own tenant
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
 * PATCH /tenants/:id - Update tenant
 */
router.patch(
  '/:id',
  requireAuth,
  requireRole('platform_admin'),
  audit('tenant.update'),
  async (req, res) => {
    const tenant = tenants.get(req.params.id);

    if (!tenant) {
      return res.status(404).json({
        success: false,
        error: { code: 'TENANT_NOT_FOUND', message: 'Tenant not found' },
      });
    }

    const updates = req.body;

    // Update allowed fields
    if (updates.name) tenant.name = updates.name;
    if (updates.plan) {
      tenant.plan = updates.plan;
      // Optionally update limits to match new plan
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
    tenants.set(tenant.id, tenant);

    res.json({
      success: true,
      data: { ...tenant, apiKeyHash: undefined },
    });
  }
);

/**
 * POST /tenants/:id/suspend - Suspend a tenant
 */
router.post(
  '/:id/suspend',
  requireAuth,
  requireRole('platform_admin'),
  audit('tenant.suspend'),
  async (req, res) => {
    const tenant = tenants.get(req.params.id);

    if (!tenant) {
      return res.status(404).json({
        success: false,
        error: { code: 'TENANT_NOT_FOUND', message: 'Tenant not found' },
      });
    }

    tenant.status = 'suspended';
    tenant.updatedAt = new Date();
    tenants.set(tenant.id, tenant);

    res.json({
      success: true,
      data: { ...tenant, apiKeyHash: undefined },
    });
  }
);

/**
 * POST /tenants/:id/resume - Resume a suspended tenant
 */
router.post(
  '/:id/resume',
  requireAuth,
  requireRole('platform_admin'),
  audit('tenant.resume'),
  async (req, res) => {
    const tenant = tenants.get(req.params.id);

    if (!tenant) {
      return res.status(404).json({
        success: false,
        error: { code: 'TENANT_NOT_FOUND', message: 'Tenant not found' },
      });
    }

    tenant.status = 'active';
    tenant.updatedAt = new Date();
    tenants.set(tenant.id, tenant);

    res.json({
      success: true,
      data: { ...tenant, apiKeyHash: undefined },
    });
  }
);

/**
 * POST /tenants/:id/rotate-api-key - Rotate API key
 */
router.post(
  '/:id/rotate-api-key',
  requireAuth,
  requireRole('platform_admin', 'tenant_admin'),
  audit('tenant.rotate_api_key'),
  async (req, res) => {
    const tenant = tenants.get(req.params.id);

    if (!tenant) {
      return res.status(404).json({
        success: false,
        error: { code: 'TENANT_NOT_FOUND', message: 'Tenant not found' },
      });
    }

    // Tenant admins can only rotate their own key
    if (req.user?.role === 'tenant_admin' && req.user?.tenantId !== tenant.id) {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Access denied' },
      });
    }

    const newApiKey = `ixk_${randomBytes(32).toString('hex')}`;
    tenant.apiKeyHash = await bcrypt.hash(newApiKey, 10);
    tenant.updatedAt = new Date();
    tenants.set(tenant.id, tenant);

    res.json({
      success: true,
      data: {
        apiKey: newApiKey, // Only returned once
        message: 'API key rotated successfully. Store the new key securely.',
      },
    });
  }
);

/**
 * DELETE /tenants/:id - Delete (cancel) a tenant
 */
router.delete(
  '/:id',
  requireAuth,
  requireRole('platform_admin'),
  audit('tenant.delete'),
  async (req, res) => {
    const tenant = tenants.get(req.params.id);

    if (!tenant) {
      return res.status(404).json({
        success: false,
        error: { code: 'TENANT_NOT_FOUND', message: 'Tenant not found' },
      });
    }

    tenant.status = 'cancelled';
    tenant.updatedAt = new Date();
    tenants.set(tenant.id, tenant);

    // In production: schedule data deletion per retention policy

    res.json({
      success: true,
      data: { message: 'Tenant cancelled. Data will be deleted per retention policy.' },
    });
  }
);

export { router as tenantsRouter };
