import express from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Mock store ───────────────────────────────────────────────────────────────
const { getTenantMock, saveTenantMock, listTenantsMock, currentRole } = vi.hoisted(() => ({
  getTenantMock: vi.fn(),
  saveTenantMock: vi.fn(),
  listTenantsMock: vi.fn(),
  currentRole: { value: 'platform_admin' as string, tenantId: 'user-tenant-1' as string },
}));

vi.mock('../store/tenants.js', () => ({
  getTenant: getTenantMock,
  saveTenant: saveTenantMock,
  listTenants: listTenantsMock,
}));

vi.mock('../middleware/auth.js', () => ({
  requireAuth: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    req.user = {
      id: 'user-1',
      email: 'admin@test.com',
      role: currentRole.value as any,
      tenantId: currentRole.tenantId,
    };
    req.tenantId = currentRole.tenantId;
    next();
  },
  requireRole: (...allowedRoles: string[]) =>
    (req: express.Request, res: express.Response, next: express.NextFunction) => {
      const rolePriority: Record<string, number> = {
        platform_admin: 0,
        tenant_admin: 1,
        operator: 2,
        viewer: 3,
      };
      const userPriority = rolePriority[req.user?.role ?? 'viewer'] ?? 99;
      const minRequired = Math.min(...allowedRoles.map(r => rolePriority[r] ?? 99));
      if (userPriority <= minRequired) return next();
      return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Insufficient role' } });
    },
  requireTenant: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    req.tenantId = currentRole.tenantId;
    next();
  },
}));

vi.mock('../middleware/audit.js', () => ({
  audit: () => (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
}));

vi.mock('../middleware/validate.js', () => ({
  validate: () => (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
}));

import { tenantsRouter } from './tenants.js';

// ─── Plan limits constants (mirror of tenants.ts) ─────────────────────────────
const PLAN_LIMITS = {
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
} as const;

function makeTenant(overrides: Partial<{
  id: string;
  name: string;
  plan: string;
  status: string;
  ownerId: string;
}> = {}) {
  return {
    id: overrides.id ?? 'ten_TEST01',
    name: overrides.name ?? 'Test Tenant',
    plan: overrides.plan ?? 'free',
    status: overrides.status ?? 'active',
    ownerId: 'usr_OWNER',
    limits: PLAN_LIMITS[(overrides.plan ?? 'free') as keyof typeof PLAN_LIMITS] ?? PLAN_LIMITS.free,
    metadata: {},
    apiKeyHash: '$2b$10$hashedhash',
    webhookSecret: 'whsec_secret',
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe('tenants-extended — HTTP routes', () => {
  let server: ReturnType<express.Application['listen']> | null = null;
  let baseUrl = '';

  beforeEach(async () => {
    getTenantMock.mockReset();
    saveTenantMock.mockReset();
    listTenantsMock.mockReset();
    saveTenantMock.mockResolvedValue(undefined);
    currentRole.value = 'platform_admin';
    currentRole.tenantId = 'user-tenant-1';

    const app = express();
    app.use(express.json());
    app.use('/api/tenants', tenantsRouter);

    await new Promise<void>(resolve => {
      server = app.listen(0, '127.0.0.1', () => {
        const address = server!.address();
        if (!address || typeof address === 'string') throw new Error('Unexpected address');
        baseUrl = `http://127.0.0.1:${address.port}`;
        resolve();
      });
    });
  });

  afterEach(async () => {
    if (!server) return;
    await new Promise<void>((resolve, reject) => {
      server!.close(error => error ? reject(error) : resolve());
    });
    server = null;
  });

  // ── POST / — Create tenant (various plans) ───────────────────────────────

  it.each([
    { label: 'free plan', plan: 'free', name: 'Free Tenant' },
    { label: 'starter plan', plan: 'starter', name: 'Starter Co' },
    { label: 'professional plan', plan: 'professional', name: 'Pro Corp' },
    { label: 'enterprise plan', plan: 'enterprise', name: 'Enterprise Inc' },
  ])('POST / — creates tenant with $label', async ({ plan, name }) => {
    const response = await fetch(`${baseUrl}/api/tenants`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        plan,
        ownerEmail: 'owner@example.com',
        ownerName: 'Owner Name',
      }),
    });
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(payload.success).toBe(true);
    expect(payload.data.tenant.plan).toBe(plan);
    expect(payload.data.tenant.name).toBe(name);
    expect(payload.data.apiKey).toMatch(/^ixk_/);
    expect(payload.data.webhookSecret).toMatch(/^whsec_/);
    expect(payload.data.tenant.apiKeyHash).toBeUndefined();
    expect(saveTenantMock).toHaveBeenCalledOnce();
  });

  it.each([
    { label: 'with metadata', name: 'Meta Tenant', plan: 'free', metadata: { region: 'ar', industry: 'retail' } },
    { label: 'with custom limits', name: 'Custom Tenant', plan: 'professional', limits: { requestsPerMinute: 999, jobsPerMinute: 2000, maxConcurrentJobs: 100, maxWorkflows: 100, maxConnectors: 50, dataRetentionDays: 180 } },
    { label: 'minimal fields', name: 'Min Tenant', plan: 'starter' },
  ])('POST / — creates tenant $label', async ({ name, plan, metadata, limits }) => {
    const response = await fetch(`${baseUrl}/api/tenants`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, plan, ownerEmail: 'x@y.com', ownerName: 'X Y', metadata, limits }),
    });
    const payload = await response.json();
    expect(response.status).toBe(201);
    expect(payload.success).toBe(true);
    expect(payload.data.tenant.name).toBe(name);
  });

  it('POST / — 403 for tenant_admin role', async () => {
    currentRole.value = 'tenant_admin';

    const response = await fetch(`${baseUrl}/api/tenants`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'New Tenant', plan: 'free', ownerEmail: 'x@y.com', ownerName: 'X' }),
    });

    expect(response.status).toBe(403);
  });

  it('POST / — 403 for operator role', async () => {
    currentRole.value = 'operator';

    const response = await fetch(`${baseUrl}/api/tenants`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'New Tenant', plan: 'free', ownerEmail: 'x@y.com', ownerName: 'X' }),
    });

    expect(response.status).toBe(403);
  });

  // ── GET / — List tenants ──────────────────────────────────────────────────

  it.each([
    { label: 'no filters', query: '', totalItems: 3, count: 3 },
    { label: 'filter by active status', query: '?status=active', totalItems: 2, count: 2 },
    { label: 'filter by suspended status', query: '?status=suspended', totalItems: 1, count: 1 },
    { label: 'filter by free plan', query: '?plan=free', totalItems: 5, count: 5 },
    { label: 'filter by enterprise plan', query: '?plan=enterprise', totalItems: 1, count: 1 },
    { label: 'page 2', query: '?page=2&pageSize=10', totalItems: 25, count: 5 },
    { label: 'combined status+plan', query: '?status=active&plan=professional', totalItems: 2, count: 2 },
    { label: 'empty result', query: '?status=cancelled', totalItems: 0, count: 0 },
  ])('GET / — list tenants: $label', async ({ query, totalItems, count }) => {
    const tenants = Array.from({ length: count }, (_, i) => makeTenant({ id: `ten_${i}` }));
    listTenantsMock.mockResolvedValueOnce({ data: tenants, totalItems });

    const response = await fetch(`${baseUrl}/api/tenants${query}`);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.success).toBe(true);
    expect(payload.data).toHaveLength(count);
    expect(payload.pagination.totalItems).toBe(totalItems);
    expect(payload.pagination.totalPages).toBe(Math.ceil(totalItems / (Number(new URLSearchParams(query.replace('?', '')).get('pageSize')) || 20)));
  });

  it('GET / — 403 for tenant_admin role', async () => {
    currentRole.value = 'tenant_admin';
    const response = await fetch(`${baseUrl}/api/tenants`);
    expect(response.status).toBe(403);
  });

  // ── GET /:id — Get tenant by ID ──────────────────────────────────────────

  it.each([
    { id: 'ten_01AAAA', plan: 'free', status: 'active' },
    { id: 'ten_01BBBB', plan: 'starter', status: 'active' },
    { id: 'ten_01CCCC', plan: 'professional', status: 'suspended' },
    { id: 'ten_01DDDD', plan: 'enterprise', status: 'active' },
  ])('GET /:id — returns tenant $id ($plan plan, $status)', async ({ id, plan, status }) => {
    const tenant = makeTenant({ id, plan, status });
    getTenantMock.mockResolvedValueOnce(tenant);

    const response = await fetch(`${baseUrl}/api/tenants/${id}`);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.success).toBe(true);
    expect(payload.data.id).toBe(id);
    expect(payload.data.plan).toBe(plan);
    expect(payload.data.apiKeyHash).toBeUndefined();
  });

  it.each([
    'ten_NONEXISTENT',
    'ten_DELETED',
    'ten_UNKNOWN',
  ])('GET /:id — 404 for "%s"', async (id) => {
    getTenantMock.mockResolvedValueOnce(null);
    const response = await fetch(`${baseUrl}/api/tenants/${id}`);
    const payload = await response.json();
    expect(response.status).toBe(404);
    expect(payload.error.code).toBe('TENANT_NOT_FOUND');
  });

  it('GET /:id — 403 when tenant_admin accesses another tenant', async () => {
    currentRole.value = 'tenant_admin';
    currentRole.tenantId = 'ten_MINE';
    getTenantMock.mockResolvedValueOnce(makeTenant({ id: 'ten_OTHERS' }));

    const response = await fetch(`${baseUrl}/api/tenants/ten_OTHERS`);
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error.code).toBe('FORBIDDEN');
  });

  it('GET /:id — tenant_admin can access own tenant', async () => {
    currentRole.value = 'tenant_admin';
    currentRole.tenantId = 'ten_MINE';
    getTenantMock.mockResolvedValueOnce(makeTenant({ id: 'ten_MINE' }));

    const response = await fetch(`${baseUrl}/api/tenants/ten_MINE`);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data.id).toBe('ten_MINE');
  });

  // ── PATCH /:id — Update tenant ───────────────────────────────────────────

  it.each([
    { label: 'name update', update: { name: 'New Name' } },
    { label: 'plan upgrade free → starter', update: { plan: 'starter' } },
    { label: 'plan upgrade to professional', update: { plan: 'professional' } },
    { label: 'plan upgrade to enterprise', update: { plan: 'enterprise' } },
    { label: 'metadata update', update: { metadata: { region: 'ar', tier: 'gold' } } },
    { label: 'custom limits override', update: { limits: { requestsPerMinute: 999, jobsPerMinute: 1000, maxConcurrentJobs: 20, maxWorkflows: 25, maxConnectors: 10, dataRetentionDays: 60 } } },
    { label: 'plan + name simultaneous update', update: { name: 'Upgraded Co', plan: 'enterprise' } },
    { label: 'metadata merge', update: { metadata: { key1: 'val1', key2: 'val2' } } },
  ])('PATCH /:id — $label', async ({ update }) => {
    const existing = makeTenant({ id: 'ten_PATCH01', plan: 'free' });
    getTenantMock.mockResolvedValueOnce(existing);

    const response = await fetch(`${baseUrl}/api/tenants/ten_PATCH01`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(update),
    });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.success).toBe(true);
    expect(saveTenantMock).toHaveBeenCalledOnce();
  });

  it('PATCH /:id — 404 when tenant not found', async () => {
    getTenantMock.mockResolvedValueOnce(null);
    const response = await fetch(`${baseUrl}/api/tenants/ten_NONE`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'X' }),
    });
    const payload = await response.json();
    expect(response.status).toBe(404);
    expect(payload.error.code).toBe('TENANT_NOT_FOUND');
  });

  it('PATCH /:id — plan change auto-applies plan limits when no custom limits provided', async () => {
    const existing = makeTenant({ id: 'ten_UPGRADE', plan: 'free' });
    getTenantMock.mockResolvedValueOnce(existing);

    const response = await fetch(`${baseUrl}/api/tenants/ten_UPGRADE`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan: 'enterprise' }),
    });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data.plan).toBe('enterprise');
    expect(payload.data.limits.requestsPerMinute).toBe(PLAN_LIMITS.enterprise.requestsPerMinute);
    expect(payload.data.limits.maxConnectors).toBe(PLAN_LIMITS.enterprise.maxConnectors);
  });

  // ── Plan limits validation (data-driven) ─────────────────────────────────

  it.each(
    Object.entries(PLAN_LIMITS).map(([plan, limits]) => ({ plan, limits }))
  )('Plan limits for "$plan" are applied on create', async ({ plan, limits }) => {
    const response = await fetch(`${baseUrl}/api/tenants`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: `${plan} Tenant`, plan, ownerEmail: 'x@y.com', ownerName: 'X' }),
    });
    const payload = await response.json();

    expect(response.status).toBe(201);
    const tenantLimits = payload.data.tenant.limits;
    expect(tenantLimits.requestsPerMinute).toBe(limits.requestsPerMinute);
    expect(tenantLimits.maxConnectors).toBe(limits.maxConnectors);
    expect(tenantLimits.maxWorkflows).toBe(limits.maxWorkflows);
    expect(tenantLimits.dataRetentionDays).toBe(limits.dataRetentionDays);
  });

  // ── POST /:id/suspend ─────────────────────────────────────────────────────

  it.each([
    { id: 'ten_SUS01', name: 'Active Tenant 1', plan: 'free' },
    { id: 'ten_SUS02', name: 'Active Tenant 2', plan: 'starter' },
    { id: 'ten_SUS03', name: 'Active Tenant 3', plan: 'enterprise' },
  ])('POST /:id/suspend — suspends tenant $id', async ({ id, name, plan }) => {
    const tenant = makeTenant({ id, name, plan, status: 'active' });
    getTenantMock.mockResolvedValueOnce(tenant);

    const response = await fetch(`${baseUrl}/api/tenants/${id}/suspend`, { method: 'POST' });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.success).toBe(true);
    expect(payload.data.status).toBe('suspended');
    expect(saveTenantMock).toHaveBeenCalledOnce();
  });

  it('POST /:id/suspend — 404 for unknown tenant', async () => {
    getTenantMock.mockResolvedValueOnce(null);
    const response = await fetch(`${baseUrl}/api/tenants/ten_NONE/suspend`, { method: 'POST' });
    expect(response.status).toBe(404);
  });

  // ── POST /:id/resume ──────────────────────────────────────────────────────

  it.each([
    { id: 'ten_RES01', name: 'Suspended Tenant 1', plan: 'free' },
    { id: 'ten_RES02', name: 'Suspended Tenant 2', plan: 'professional' },
  ])('POST /:id/resume — resumes tenant $id', async ({ id, name, plan }) => {
    const tenant = makeTenant({ id, name, plan, status: 'suspended' });
    getTenantMock.mockResolvedValueOnce(tenant);

    const response = await fetch(`${baseUrl}/api/tenants/${id}/resume`, { method: 'POST' });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.success).toBe(true);
    expect(payload.data.status).toBe('active');
  });

  it('POST /:id/resume — 404 for unknown tenant', async () => {
    getTenantMock.mockResolvedValueOnce(null);
    const response = await fetch(`${baseUrl}/api/tenants/ten_NONE/resume`, { method: 'POST' });
    expect(response.status).toBe(404);
  });

  // ── Suspend → Resume flow ────────────────────────────────────────────────

  it('suspend then resume flow', async () => {
    const tenant = makeTenant({ id: 'ten_FLOW01', status: 'active' });

    // Suspend
    getTenantMock.mockResolvedValueOnce({ ...tenant });
    const suspendResponse = await fetch(`${baseUrl}/api/tenants/ten_FLOW01/suspend`, { method: 'POST' });
    expect(suspendResponse.status).toBe(200);
    const suspendPayload = await suspendResponse.json();
    expect(suspendPayload.data.status).toBe('suspended');

    // Resume
    getTenantMock.mockResolvedValueOnce({ ...tenant, status: 'suspended' });
    const resumeResponse = await fetch(`${baseUrl}/api/tenants/ten_FLOW01/resume`, { method: 'POST' });
    expect(resumeResponse.status).toBe(200);
    const resumePayload = await resumeResponse.json();
    expect(resumePayload.data.status).toBe('active');
  });

  // ── DELETE /:id ───────────────────────────────────────────────────────────

  it.each([
    { id: 'ten_DEL01', plan: 'free' },
    { id: 'ten_DEL02', plan: 'enterprise' },
    { id: 'ten_DEL03', plan: 'starter' },
  ])('DELETE /:id — cancels tenant $id', async ({ id, plan }) => {
    const tenant = makeTenant({ id, plan, status: 'active' });
    getTenantMock.mockResolvedValueOnce(tenant);

    const response = await fetch(`${baseUrl}/api/tenants/${id}`, { method: 'DELETE' });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.success).toBe(true);
    expect(payload.data.message).toContain('cancelled');
    expect(saveTenantMock).toHaveBeenCalledOnce();
  });

  it('DELETE /:id — 404 for unknown tenant', async () => {
    getTenantMock.mockResolvedValueOnce(null);
    const response = await fetch(`${baseUrl}/api/tenants/ten_NONE`, { method: 'DELETE' });
    expect(response.status).toBe(404);
  });

  it('DELETE /:id — 403 for tenant_admin', async () => {
    currentRole.value = 'tenant_admin';
    const response = await fetch(`${baseUrl}/api/tenants/ten_X`, { method: 'DELETE' });
    expect(response.status).toBe(403);
  });

  // ── POST /:id/rotate-api-key ─────────────────────────────────────────────

  it.each([
    { id: 'ten_ROT01', role: 'platform_admin', ownTenant: false },
    { id: 'ten_ROT02', role: 'platform_admin', ownTenant: true },
  ])('POST /:id/rotate-api-key — platform_admin can rotate any key', async ({ id }) => {
    const tenant = makeTenant({ id });
    getTenantMock.mockResolvedValueOnce(tenant);

    const response = await fetch(`${baseUrl}/api/tenants/${id}/rotate-api-key`, { method: 'POST' });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.success).toBe(true);
    expect(payload.data.apiKey).toMatch(/^ixk_/);
  });

  it('POST /:id/rotate-api-key — tenant_admin can rotate own key', async () => {
    currentRole.value = 'tenant_admin';
    currentRole.tenantId = 'ten_MINE';
    const tenant = makeTenant({ id: 'ten_MINE' });
    getTenantMock.mockResolvedValueOnce(tenant);

    const response = await fetch(`${baseUrl}/api/tenants/ten_MINE/rotate-api-key`, { method: 'POST' });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data.apiKey).toMatch(/^ixk_/);
  });

  it('POST /:id/rotate-api-key — tenant_admin cannot rotate another tenant key', async () => {
    currentRole.value = 'tenant_admin';
    currentRole.tenantId = 'ten_MINE';
    getTenantMock.mockResolvedValueOnce(makeTenant({ id: 'ten_OTHERS' }));

    const response = await fetch(`${baseUrl}/api/tenants/ten_OTHERS/rotate-api-key`, { method: 'POST' });

    expect(response.status).toBe(403);
  });

  it('POST /:id/rotate-api-key — 404 for unknown tenant', async () => {
    getTenantMock.mockResolvedValueOnce(null);
    const response = await fetch(`${baseUrl}/api/tenants/ten_NONE/rotate-api-key`, { method: 'POST' });
    expect(response.status).toBe(404);
  });

  // ── Multi-tenant isolation ───────────────────────────────────────────────

  it.each([
    { tenantA: 'ten_ISO01', tenantB: 'ten_ISO02' },
    { tenantA: 'ten_ISO03', tenantB: 'ten_ISO04' },
  ])('GET /:id — tenant_admin $tenantA cannot access $tenantB', async ({ tenantA, tenantB }) => {
    currentRole.value = 'tenant_admin';
    currentRole.tenantId = tenantA;
    getTenantMock.mockResolvedValueOnce(makeTenant({ id: tenantB }));

    const response = await fetch(`${baseUrl}/api/tenants/${tenantB}`);
    expect(response.status).toBe(403);
  });

  // ── Pagination ───────────────────────────────────────────────────────────

  it.each([
    { page: 1, pageSize: 5, totalItems: 12, expectedTotalPages: 3 },
    { page: 2, pageSize: 10, totalItems: 25, expectedTotalPages: 3 },
    { page: 1, pageSize: 20, totalItems: 0, expectedTotalPages: 0 },
    { page: 1, pageSize: 1, totalItems: 1, expectedTotalPages: 1 },
    { page: 3, pageSize: 7, totalItems: 21, expectedTotalPages: 3 },
  ])('GET / — pagination page=$page pageSize=$pageSize totalItems=$totalItems', async ({ page, pageSize, totalItems, expectedTotalPages }) => {
    const count = Math.min(pageSize, Math.max(0, totalItems - (page - 1) * pageSize));
    listTenantsMock.mockResolvedValueOnce({
      data: Array.from({ length: count }, (_, i) => makeTenant({ id: `ten_P${i}` })),
      totalItems,
    });

    const response = await fetch(`${baseUrl}/api/tenants?page=${page}&pageSize=${pageSize}`);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.pagination.page).toBe(page);
    expect(payload.pagination.pageSize).toBe(pageSize);
    expect(payload.pagination.totalItems).toBe(totalItems);
    expect(payload.pagination.totalPages).toBe(expectedTotalPages);
  });
});
