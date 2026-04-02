import express from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { queryMock, listTenantsMock, getAuditLogsMock } = vi.hoisted(() => ({
  queryMock: vi.fn(),
  listTenantsMock: vi.fn(),
  getAuditLogsMock: vi.fn(),
}));

vi.mock('../middleware/auth.js', () => ({
  requireAuth: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    req.user = {
      id: 'admin-1',
      email: 'admin@test.com',
      role: 'platform_admin',
      tenantId: null,
    };
    next();
  },
  requireRole: () => (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
}));

vi.mock('../store/tenants.js', () => ({
  listTenants: listTenantsMock,
}));

vi.mock('../middleware/audit.js', () => ({
  getAuditLogs: getAuditLogsMock,
}));

vi.mock('../store/db.js', () => ({
  pool: {
    query: queryMock,
  },
}));

import { adminRouter } from './admin.js';

describe('admin router', () => {
  let server: ReturnType<express.Application['listen']> | null = null;
  let baseUrl = '';
  const originalNodeEnv = process.env.NODE_ENV;
  const originalAdminEmail = process.env.ADMIN_EMAIL;
  const originalAdminPassword = process.env.ADMIN_PASSWORD;
  const originalJwtSecret = process.env.JWT_SECRET;

  beforeEach(async () => {
    process.env.NODE_ENV = 'test';
    delete process.env.ADMIN_EMAIL;
    delete process.env.ADMIN_PASSWORD;
    delete process.env.JWT_SECRET;

    queryMock.mockReset();
    listTenantsMock.mockReset();
    getAuditLogsMock.mockReset();

    listTenantsMock.mockResolvedValue({
      data: [
        { id: 'ten_1', status: 'active' },
        { id: 'ten_2', status: 'active' },
        { id: 'ten_3', status: 'suspended' },
      ],
      totalItems: 3,
    });

    getAuditLogsMock.mockReturnValue({
      total: 2,
      entries: [
        {
          id: 1,
          action: 'schemas.diff.start',
          tenantId: 'ten_1',
          details: {},
          createdAt: new Date('2026-04-01T10:00:00.000Z'),
        },
        {
          id: 2,
          action: 'schemas.feedback',
          tenantId: 'ten_1',
          details: { success: false },
          createdAt: new Date('2026-04-01T11:00:00.000Z'),
        },
      ],
    });

    queryMock
      .mockResolvedValueOnce({
        rows: [
          { bucket: '08:00', events: '1', success: '0', failed: '1' },
          { bucket: '12:00', events: '2', success: '2', failed: '0' },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          { name: 'mercadopago', calls: '3' },
          { name: 'contabilium', calls: '2' },
        ],
      })
      .mockResolvedValueOnce({
        rows: [{ count: '4' }],
      })
      .mockResolvedValueOnce({
        rows: [{ events_today: '3', breaking_reports: '1', avg_coverage: '82.50' }],
      })
      .mockResolvedValueOnce({
        rows: [{ open_incidents: '2' }],
      })
      .mockResolvedValueOnce({
        rows: [{ mapping_feedback_24h: '5', avg_confidence: '0.91' }],
      });

    const app = express();
    app.use(express.json());
    app.use('/api/admin', adminRouter);

    await new Promise<void>(resolve => {
      server = app.listen(0, '127.0.0.1', () => {
        const address = server!.address();
        if (!address || typeof address === 'string') {
          throw new Error('Unexpected server address');
        }
        baseUrl = `http://127.0.0.1:${address.port}`;
        resolve();
      });
    });
  });

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve, reject) => {
        server!.close(error => (error ? reject(error) : resolve()));
      });
      server = null;
    }

    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnv;
    }

    if (originalAdminEmail === undefined) {
      delete process.env.ADMIN_EMAIL;
    } else {
      process.env.ADMIN_EMAIL = originalAdminEmail;
    }

    if (originalAdminPassword === undefined) {
      delete process.env.ADMIN_PASSWORD;
    } else {
      process.env.ADMIN_PASSWORD = originalAdminPassword;
    }

    if (originalJwtSecret === undefined) {
      delete process.env.JWT_SECRET;
    } else {
      process.env.JWT_SECRET = originalJwtSecret;
    }
  });

  it('GET /dashboard returns MVP metrics backed by current tables', async () => {
    const response = await fetch(`${baseUrl}/api/admin/dashboard`, {
      headers: { Authorization: 'Bearer fake' },
    });
    const payload: any = await response.json();

    expect(response.status).toBe(200);
    expect(payload.success).toBe(true);
    expect(payload.eventsData).toHaveLength(6);
    expect(payload.connectorUsage[0]).toEqual({ name: 'mercadopago', calls: 3 });
    expect(payload.stats.tenants).toBe(3);
    expect(payload.stats.eventsToday).toBe(3);
    expect(payload.stats.connectors).toBe(4);
    expect(payload.stats.uptime).toBeCloseTo(66.67, 2);
    expect(payload.stats.openIncidents).toBe(2);
    expect(payload.stats.avgCoverage).toBe(82.5);
    expect(payload.stats.mappingFeedbackToday).toBe(5);
    expect(payload.stats.avgConfidence).toBe(0.91);
    expect(payload.stats.tenantsChange).toBe('2 activos');
    expect(payload.stats.incidentsChange).toBe('2 incidentes abiertos');
    expect(payload.stats.coverageChange).toBe('5 decisiones en 24h');
  });

  it('POST /login rejects insecure production setup without required env vars', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.ADMIN_EMAIL;
    delete process.env.ADMIN_PASSWORD;
    delete process.env.JWT_SECRET;

    const response = await fetch(`${baseUrl}/api/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'admin@integrax.io',
        password: 'integrax-dev',
      }),
    });
    const payload: any = await response.json();

    expect(response.status).toBe(500);
    expect(payload.success).toBe(false);
    expect(payload.error.code).toBe('ADMIN_CONFIG_ERROR');
    expect(payload.error.message).toContain('JWT_SECRET');
    expect(payload.error.message).toContain('ADMIN_EMAIL');
    expect(payload.error.message).toContain('ADMIN_PASSWORD');
  });
});
