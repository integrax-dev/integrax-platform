import express from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { queryMock } = vi.hoisted(() => ({
  queryMock: vi.fn(),
}));

vi.mock('../middleware/auth.js', () => ({
  requireAuth: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    req.user = {
      id: 'user-1',
      email: 'ops@test.com',
      role: 'tenant_admin',
      tenantId: 'tenant-1',
    };
    req.tenantId = 'tenant-1';
    next();
  },
  requireTenant: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    req.tenantId = 'tenant-1';
    next();
  },
}));

vi.mock('../middleware/audit.js', () => ({
  audit: () => (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
}));

vi.mock('../middleware/rate-limit.js', () => ({
  rateLimit: () => (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
}));

vi.mock('../store/db.js', () => ({
  pool: {
    query: queryMock,
  },
}));

import { incidentsRouter } from './incidents.js';

describe('incidents router', () => {
  let server: ReturnType<express.Application['listen']> | null = null;
  let baseUrl = '';

  beforeEach(async () => {
    queryMock.mockReset();

    const app = express();
    app.use(express.json());
    app.use('/api/incidents', incidentsRouter);

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
    if (!server) return;
    await new Promise<void>((resolve, reject) => {
      server!.close(error => error ? reject(error) : resolve());
    });
    server = null;
  });

  it('GET / returns incidents derived from schema diff reports', async () => {
    queryMock.mockResolvedValueOnce({
      rows: [{
        id: 'rep_01',
        tenant_id: 'tenant-1',
        workflow_id: 'wf_01',
        source_connector_id: 'mercadopago',
        target_connector_id: 'contabilium',
        created_at: '2026-04-01T10:00:00.000Z',
        incident_status: 'open',
        diff_payload: {
          summary: {
            coveragePercent: 85,
            breakingCount: 1,
            nonBreakingCount: 2,
          },
          mismatches: {
            addedFields: ['payer_name'],
            removedFields: ['customer_name'],
            typeChanges: [],
            renameCandidates: [{ fromPath: 'customer_name', toPath: 'payer_name', similarityPct: 92 }],
          },
        },
      }],
    });

    const response = await fetch(`${baseUrl}/api/incidents`);
    const payload: any = await response.json();

    expect(response.status).toBe(200);
    expect(payload.success).toBe(true);
    expect(payload.data).toHaveLength(1);
    expect(payload.data[0].reportId).toBe('rep_01');
    expect(payload.data[0].severity).toBe('critical');
    expect(payload.data[0].compatibilityClass).toBe('breaking');
    expect(payload.data[0].changeCount).toBe(3);
  });

  it('GET /:id returns a single incident', async () => {
    queryMock.mockResolvedValueOnce({
      rows: [{
        id: 'rep_02',
        tenant_id: 'tenant-1',
        workflow_id: null,
        source_connector_id: 'mercadopago',
        target_connector_id: 'email',
        created_at: '2026-04-01T10:00:00.000Z',
        incident_status: 'investigating',
        diff_payload: {
          summary: {
            coveragePercent: 100,
            breakingCount: 0,
            nonBreakingCount: 1,
          },
        },
      }],
    });

    const response = await fetch(`${baseUrl}/api/incidents/incident-rep_02`);
    const payload: any = await response.json();

    expect(response.status).toBe(200);
    expect(payload.success).toBe(true);
    expect(payload.data.id).toBe('incident-rep_02');
    expect(payload.data.severity).toBe('major');
  });

  it('GET /:id returns 404 when no report exists', async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    const response = await fetch(`${baseUrl}/api/incidents/incident-missing`);
    const payload: any = await response.json();

    expect(response.status).toBe(404);
    expect(payload.success).toBe(false);
    expect(payload.error.code).toBe('NOT_FOUND');
  });

  it('POST /:id/resolve persists incident status', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ id: 'rep_03' }] })
      .mockResolvedValueOnce({ rows: [] });

    const response = await fetch(`${baseUrl}/api/incidents/incident-rep_03/resolve`, {
      method: 'POST',
    });
    const payload: any = await response.json();

    expect(response.status).toBe(200);
    expect(payload.success).toBe(true);
    expect(payload.data.status).toBe('resolved');
    expect(queryMock).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('INSERT INTO drift_incidents'),
      ['incident-rep_03', 'rep_03', 'resolved', 'tenant-1'],
    );
  });

  it('POST /:id/dismiss returns 404 when report does not exist', async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    const response = await fetch(`${baseUrl}/api/incidents/incident-missing/dismiss`, {
      method: 'POST',
    });
    const payload: any = await response.json();

    expect(response.status).toBe(404);
    expect(payload.success).toBe(false);
    expect(payload.error.code).toBe('NOT_FOUND');
  });
});
