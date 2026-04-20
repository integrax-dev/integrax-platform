/**
 * Flows routes tests
 *
 * Covers:
 *   - Flow mappings CRUD (GET list, GET single, PUT, DELETE)
 *   - Activepieces proxy: list flows, trigger, enable/disable, run status, cancel
 *   - 503 when ACTIVEPIECES_BASE_URL / API_KEY are not set
 */

import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── Hoisted mocks ─────────────────────────────────────────────────────────────

const {
  listFlowMappingsMock,
  getFlowMappingMock,
  saveFlowMappingMock,
  deleteFlowMappingMock,
  triggerFlowMock,
  listFlowsMock,
  enableFlowMock,
  disableFlowMock,
  getRunStatusMock,
  cancelRunMock,
} = vi.hoisted(() => ({
  listFlowMappingsMock:  vi.fn(),
  getFlowMappingMock:    vi.fn(),
  saveFlowMappingMock:   vi.fn(),
  deleteFlowMappingMock: vi.fn(),
  triggerFlowMock:       vi.fn(),
  listFlowsMock:         vi.fn(),
  enableFlowMock:        vi.fn(),
  disableFlowMock:       vi.fn(),
  getRunStatusMock:      vi.fn(),
  cancelRunMock:         vi.fn(),
}));

vi.mock('../store/tenant-flow-mappings.js', () => ({
  listFlowMappings:            listFlowMappingsMock,
  getFlowMapping:              getFlowMappingMock,
  saveFlowMapping:             saveFlowMappingMock,
  deleteFlowMapping:           deleteFlowMappingMock,
  getActiveFlowMappingsByEvent: vi.fn().mockResolvedValue([]),
}));

vi.mock('@integrax/integration-engine', () => ({
  ActivepiecesAdapter: class {
    triggerFlow   = triggerFlowMock;
    listFlows     = listFlowsMock;
    enableFlow    = enableFlowMock;
    disableFlow   = disableFlowMock;
    getRunStatus  = getRunStatusMock;
    cancelRun     = cancelRunMock;
  },
}));

vi.mock('../middleware/auth.js', () => ({
  requireAuth: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    req.user = { id: 'u1', email: 'ops@test.com', role: 'tenant_admin', tenantId: 'T1' };
    req.tenantId = 'T1';
    next();
  },
  requireRole: (..._roles: string[]) =>
    (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
}));

import { flowsRouter } from './flows.js';

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/tenants/:tenantId', flowsRouter);
  return app;
}

const NOW = new Date('2025-01-01T00:00:00Z');

function mapping(overrides = {}) {
  return {
    id: 'm1',
    tenantId: 'T1',
    eventType: 'order.created',
    flowId: 'flow-abc',
    enabled: true,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

// ── Flow mappings CRUD ────────────────────────────────────────────────────────

describe('GET /api/tenants/:tenantId/flow-mappings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns list of mappings', async () => {
    listFlowMappingsMock.mockResolvedValue([mapping()]);
    const res = await request(makeApp()).get('/api/tenants/T1/flow-mappings');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].flowId).toBe('flow-abc');
  });

  it('returns empty array when no mappings', async () => {
    listFlowMappingsMock.mockResolvedValue([]);
    const res = await request(makeApp()).get('/api/tenants/T1/flow-mappings');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(0);
  });
});

describe('GET /api/tenants/:tenantId/flow-mappings/:eventType', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns single mapping', async () => {
    getFlowMappingMock.mockResolvedValue(mapping());
    const res = await request(makeApp()).get('/api/tenants/T1/flow-mappings/order.created');
    expect(res.status).toBe(200);
    expect(res.body.data.eventType).toBe('order.created');
  });

  it('returns 404 when not found', async () => {
    getFlowMappingMock.mockResolvedValue(null);
    const res = await request(makeApp()).get('/api/tenants/T1/flow-mappings/unknown.event');
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});

describe('PUT /api/tenants/:tenantId/flow-mappings/:eventType', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates new mapping when none exists', async () => {
    getFlowMappingMock
      .mockResolvedValueOnce(null)     // check for existing
      .mockResolvedValueOnce(mapping()); // re-fetch after save
    saveFlowMappingMock.mockResolvedValue(undefined);

    const res = await request(makeApp())
      .put('/api/tenants/T1/flow-mappings/order.created')
      .send({ flowId: 'flow-abc' });

    expect(res.status).toBe(200);
    expect(saveFlowMappingMock).toHaveBeenCalledOnce();
    const saved = saveFlowMappingMock.mock.calls[0][0];
    expect(saved.flowId).toBe('flow-abc');
    expect(saved.enabled).toBe(true);
  });

  it('updates existing mapping preserving id and createdAt', async () => {
    const existing = mapping({ id: 'existing-id' });
    getFlowMappingMock
      .mockResolvedValueOnce(existing)
      .mockResolvedValueOnce({ ...existing, flowId: 'flow-new' });
    saveFlowMappingMock.mockResolvedValue(undefined);

    await request(makeApp())
      .put('/api/tenants/T1/flow-mappings/order.created')
      .send({ flowId: 'flow-new' });

    const saved = saveFlowMappingMock.mock.calls[0][0];
    expect(saved.id).toBe('existing-id');
    expect(saved.createdAt).toEqual(existing.createdAt);
  });

  it('returns 400 when flowId is missing', async () => {
    const res = await request(makeApp())
      .put('/api/tenants/T1/flow-mappings/order.created')
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/flowId/i);
  });

  it('respects enabled=false', async () => {
    getFlowMappingMock.mockResolvedValue(null);
    saveFlowMappingMock.mockResolvedValue(undefined);
    getFlowMappingMock.mockResolvedValueOnce(null).mockResolvedValueOnce(mapping({ enabled: false }));

    await request(makeApp())
      .put('/api/tenants/T1/flow-mappings/order.created')
      .send({ flowId: 'flow-abc', enabled: false });

    const saved = saveFlowMappingMock.mock.calls[0][0];
    expect(saved.enabled).toBe(false);
  });
});

describe('DELETE /api/tenants/:tenantId/flow-mappings/:eventType', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deletes mapping and returns success', async () => {
    deleteFlowMappingMock.mockResolvedValue(undefined);
    const res = await request(makeApp()).delete('/api/tenants/T1/flow-mappings/order.created');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(deleteFlowMappingMock).toHaveBeenCalledWith('T1', 'order.created');
  });
});

// ── AP proxy — 503 when not configured ────────────────────────────────────────

describe('Activepieces proxy — not configured', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.ACTIVEPIECES_BASE_URL;
    delete process.env.ACTIVEPIECES_API_KEY;
  });

  it('GET /flows → 503', async () => {
    const res = await request(makeApp()).get('/api/tenants/T1/flows');
    expect(res.status).toBe(503);
  });

  it('POST /flows/:id/trigger → 503', async () => {
    const res = await request(makeApp()).post('/api/tenants/T1/flows/flow-1/trigger').send({});
    expect(res.status).toBe(503);
  });

  it('PATCH /flows/:id → 503', async () => {
    const res = await request(makeApp()).patch('/api/tenants/T1/flows/flow-1').send({ enabled: true });
    expect(res.status).toBe(503);
  });

  it('GET /flows/runs/:runId → 503', async () => {
    const res = await request(makeApp()).get('/api/tenants/T1/flows/runs/run-1');
    expect(res.status).toBe(503);
  });

  it('POST /flows/runs/:runId/cancel → 503', async () => {
    const res = await request(makeApp()).post('/api/tenants/T1/flows/runs/run-1/cancel');
    expect(res.status).toBe(503);
  });
});

// ── AP proxy — configured ─────────────────────────────────────────────────────

describe('Activepieces proxy — configured', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ACTIVEPIECES_BASE_URL = 'http://ap';
    process.env.ACTIVEPIECES_API_KEY  = 'key';
  });

  afterEach(() => {
    delete process.env.ACTIVEPIECES_BASE_URL;
    delete process.env.ACTIVEPIECES_API_KEY;
  });

  it('GET /flows lists flows via adapter', async () => {
    listFlowsMock.mockResolvedValue([{ id: 'f1', name: 'Flow 1', tenantId: 'T1', enabled: true }]);
    const res = await request(makeApp()).get('/api/tenants/T1/flows');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(listFlowsMock).toHaveBeenCalledWith('T1');
  });

  it('POST /flows/:id/trigger fires flow and returns runId', async () => {
    triggerFlowMock.mockResolvedValue({ runId: 'run-42' });
    const res = await request(makeApp())
      .post('/api/tenants/T1/flows/flow-1/trigger')
      .send({ foo: 'bar' });
    expect(res.status).toBe(200);
    expect(res.body.data.runId).toBe('run-42');
    expect(triggerFlowMock).toHaveBeenCalledWith(
      expect.objectContaining({ flowId: 'flow-1', tenantId: 'T1' }),
    );
  });

  it('PATCH /flows/:id with enabled:true calls enableFlow', async () => {
    enableFlowMock.mockResolvedValue(undefined);
    const res = await request(makeApp())
      .patch('/api/tenants/T1/flows/flow-1')
      .send({ enabled: true });
    expect(res.status).toBe(200);
    expect(enableFlowMock).toHaveBeenCalledWith('T1', 'flow-1');
    expect(disableFlowMock).not.toHaveBeenCalled();
  });

  it('PATCH /flows/:id with enabled:false calls disableFlow', async () => {
    disableFlowMock.mockResolvedValue(undefined);
    const res = await request(makeApp())
      .patch('/api/tenants/T1/flows/flow-1')
      .send({ enabled: false });
    expect(res.status).toBe(200);
    expect(disableFlowMock).toHaveBeenCalledWith('T1', 'flow-1');
  });

  it('PATCH /flows/:id without enabled → 400', async () => {
    const res = await request(makeApp())
      .patch('/api/tenants/T1/flows/flow-1')
      .send({});
    expect(res.status).toBe(400);
  });

  it('GET /flows/runs/:runId returns run status', async () => {
    getRunStatusMock.mockResolvedValue({
      runId: 'run-42', status: 'succeeded', startedAt: '2025-01-01T00:00:00Z',
    });
    const res = await request(makeApp()).get('/api/tenants/T1/flows/runs/run-42');
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('succeeded');
    expect(getRunStatusMock).toHaveBeenCalledWith('T1', 'run-42');
  });

  it('POST /flows/runs/:runId/cancel cancels run', async () => {
    cancelRunMock.mockResolvedValue(undefined);
    const res = await request(makeApp()).post('/api/tenants/T1/flows/runs/run-42/cancel');
    expect(res.status).toBe(200);
    expect(cancelRunMock).toHaveBeenCalledWith('T1', 'run-42');
  });
});
