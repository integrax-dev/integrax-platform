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

vi.mock('../middleware/validate.js', () => ({
  validate: () => (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
}));

vi.mock('../store/db.js', () => ({
  pool: {
    query: queryMock,
  },
}));

vi.mock('../store/mapping-memory-repository.js', () => ({
  loadMappingMemory: vi.fn().mockResolvedValue([]),
  upsertEntry: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../middleware/rate-limit.js', () => ({
  rateLimit: () => (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
}));

vi.mock('@integrax/temporal-workflows', () => ({
  TemporalClientService: class {
    async connect(): Promise<void> {}
    async startSchemaDiff(): Promise<{ workflowId: string }> {
      return { workflowId: 'workflow-1' };
    }
    async getWorkflowStatus(): Promise<{ status: string }> {
      return { status: 'Completed' };
    }
  },
}));

import { schemasRouter } from './schemas.js';

describe('schemas router', () => {
  let server: ReturnType<express.Application['listen']> | null = null;
  let baseUrl = '';

  beforeEach(async () => {
    queryMock.mockReset();

    const app = express();
    app.use(express.json());
    app.use('/api/schemas', schemasRouter);

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

  it('returns a persisted schema diff report through the API path', async () => {
    queryMock.mockResolvedValueOnce({
      rows: [{
        id: 'br_01REPORT',
        tenant_id: 'tenant-1',
        diff_payload: { reportId: 'br_01REPORT', summary: { coveragePercent: 100 } },
      }],
    });

    const response = await fetch(`${baseUrl}/api/schemas/reports/br_01REPORT`);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.success).toBe(true);
    expect(payload.data.id).toBe('br_01REPORT');
    expect(queryMock).toHaveBeenCalledWith(
      'SELECT * FROM schema_diff_reports WHERE id = $1 AND tenant_id = $2',
      ['br_01REPORT', 'tenant-1'],
    );
  });

  it('resolves reportLink from workflow_id when the workflow is completed', async () => {
    queryMock.mockResolvedValueOnce({
      rows: [{ id: 'br_01REPORT' }],
    });

    const workflowId = 'schemaDiff-tenant-1-123';
    const response = await fetch(`${baseUrl}/api/schemas/status/${workflowId}`);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.success).toBe(true);
    expect(payload.data.reportLink).toBe('/api/schemas/reports/br_01REPORT');
    expect(queryMock).toHaveBeenCalledWith(
      'SELECT id FROM schema_diff_reports WHERE workflow_id = $1 AND tenant_id = $2',
      [workflowId, 'tenant-1'],
    );
  });
});
