/**
 * Nodes routes tests
 *
 * Covers:
 *   - IntegraX node catalog: GET /api/nodes, /api/nodes/:id, /api/nodes/category/:cat
 *   - Activepieces pieces proxy: /api/ap/pieces, /api/ap/pieces/:name
 *   - Webhook trigger subscriptions CRUD
 */

import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── Hoisted mocks ─────────────────────────────────────────────────────────────

const {
  saveWebhookSubscriptionMock,
  deleteWebhookSubscriptionMock,
  listSubscriptionsForTenantMock,
  getAllNodesMock,
  getNodeByIdMock,
  getNodesByCategoryMock,
} = vi.hoisted(() => ({
  saveWebhookSubscriptionMock:       vi.fn(),
  deleteWebhookSubscriptionMock:     vi.fn(),
  listSubscriptionsForTenantMock:    vi.fn(),
  getAllNodesMock:    [{ id: 'send_email', name: 'Send Email', category: 'action' }],
  getNodeByIdMock:   vi.fn(),
  getNodesByCategoryMock: vi.fn(),
}));

vi.mock('../store/webhook-trigger-subscriptions.js', () => ({
  saveWebhookSubscription:    saveWebhookSubscriptionMock,
  deleteWebhookSubscription:  deleteWebhookSubscriptionMock,
  listSubscriptionsForTenant: listSubscriptionsForTenantMock,
}));

vi.mock('@integrax/activepieces-piece', () => ({
  ALL_NODES: getAllNodesMock,
  getNodeById: getNodeByIdMock,
  getNodesByCategory: getNodesByCategoryMock,
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

import { nodesRouter } from './nodes.js';

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use(nodesRouter);
  return app;
}

// ── IntegraX node catalog ─────────────────────────────────────────────────────

describe('GET /api/nodes', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns all nodes', async () => {
    const res = await request(makeApp()).get('/api/nodes');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual(getAllNodesMock);
  });
});

describe('GET /api/nodes/category/:category', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns nodes filtered by category', async () => {
    getNodesByCategoryMock.mockReturnValue([{ id: 'send_email', name: 'Send Email', category: 'action' }]);
    const res = await request(makeApp()).get('/api/nodes/category/action');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(getNodesByCategoryMock).toHaveBeenCalledWith('action');
  });

  it('returns empty array for unknown category', async () => {
    getNodesByCategoryMock.mockReturnValue([]);
    const res = await request(makeApp()).get('/api/nodes/category/nonexistent');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(0);
  });
});

describe('GET /api/nodes/:id', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns node by id', async () => {
    getNodeByIdMock.mockReturnValue({ id: 'send_email', name: 'Send Email', category: 'action' });
    const res = await request(makeApp()).get('/api/nodes/send_email');
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe('send_email');
  });

  it('returns 404 for unknown node', async () => {
    getNodeByIdMock.mockReturnValue(undefined);
    const res = await request(makeApp()).get('/api/nodes/nope');
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});

// ── Activepieces pieces proxy ─────────────────────────────────────────────────

describe('GET /api/ap/pieces — not configured', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.ACTIVEPIECES_BASE_URL;
    delete process.env.ACTIVEPIECES_API_KEY;
  });

  it('returns 503 AP_NOT_CONFIGURED', async () => {
    const res = await request(makeApp()).get('/api/ap/pieces');
    expect(res.status).toBe(503);
    expect(res.body.error).toBe('AP_NOT_CONFIGURED');
  });

  it('returns 503 for single piece endpoint', async () => {
    const res = await request(makeApp()).get('/api/ap/pieces/gmail');
    expect(res.status).toBe(503);
  });
});

describe('GET /api/ap/pieces — configured', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ACTIVEPIECES_BASE_URL = 'http://ap';
    process.env.ACTIVEPIECES_API_KEY  = 'key';
  });

  afterEach(() => {
    delete process.env.ACTIVEPIECES_BASE_URL;
    delete process.env.ACTIVEPIECES_API_KEY;
  });

  it('proxies pieces list from AP', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify([{ name: 'gmail' }]), { status: 200 }),
    );
    const res = await request(makeApp()).get('/api/ap/pieces');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([{ name: 'gmail' }]);
    expect(fetchSpy.mock.calls[0][0]).toContain('/v1/pieces');
    fetchSpy.mockRestore();
  });

  it('sends x-api-key header to AP', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify([]), { status: 200 }),
    );
    await request(makeApp()).get('/api/ap/pieces');
    const headers = fetchSpy.mock.calls[0][1]?.headers as Record<string, string>;
    expect(headers['x-api-key']).toBe('key');
    fetchSpy.mockRestore();
  });

  it('proxies single piece by name', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ name: 'gmail', actions: [] }), { status: 200 }),
    );
    const res = await request(makeApp()).get('/api/ap/pieces/gmail');
    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('gmail');
    expect(fetchSpy.mock.calls[0][0]).toContain('/v1/pieces/gmail');
    fetchSpy.mockRestore();
  });

  it('forwards AP error status upstream', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ message: 'Not found' }), { status: 404 }),
    );
    const res = await request(makeApp()).get('/api/ap/pieces/nonexistent');
    expect(res.status).toBe(404);
    fetchSpy.mockRestore();
  });

  it('returns 503 AP_UNREACHABLE when fetch throws (timeout, ECONNREFUSED)', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'));
    const res = await request(makeApp()).get('/api/ap/pieces');
    expect(res.status).toBe(503);
    expect(res.body.error).toBe('AP_UNREACHABLE');
    vi.spyOn(globalThis, 'fetch').mockRestore();
  });

  it('forwards query params (release, includeHidden) to AP', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify([]), { status: 200 }),
    );
    await request(makeApp()).get('/api/ap/pieces?release=latest&includeHidden=true');
    const url = fetchSpy.mock.calls[0][0] as string;
    expect(url).toContain('release=latest');
    expect(url).toContain('includeHidden=true');
    fetchSpy.mockRestore();
  });
});

// ── Webhook trigger subscriptions ────────────────────────────────────────────

describe('POST /api/tenants/:tenantId/trigger-subscriptions', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates subscription and returns 201', async () => {
    saveWebhookSubscriptionMock.mockResolvedValue(undefined);
    const res = await request(makeApp())
      .post('/api/tenants/T1/trigger-subscriptions')
      .send({ eventType: 'order.created', callbackUrl: 'http://ap/hook' });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.eventType).toBe('order.created');
    expect(res.body.data.callbackUrl).toBe('http://ap/hook');
    expect(saveWebhookSubscriptionMock).toHaveBeenCalledOnce();
  });

  it('returns 400 when eventType missing', async () => {
    const res = await request(makeApp())
      .post('/api/tenants/T1/trigger-subscriptions')
      .send({ callbackUrl: 'http://ap/hook' });
    expect(res.status).toBe(400);
  });

  it('returns 400 when callbackUrl missing', async () => {
    const res = await request(makeApp())
      .post('/api/tenants/T1/trigger-subscriptions')
      .send({ eventType: 'order.created' });
    expect(res.status).toBe(400);
  });

  it('stores secret when provided', async () => {
    saveWebhookSubscriptionMock.mockResolvedValue(undefined);
    await request(makeApp())
      .post('/api/tenants/T1/trigger-subscriptions')
      .send({ eventType: 'order.created', callbackUrl: 'http://ap/hook', secret: 'sec-xyz' });
    const saved = saveWebhookSubscriptionMock.mock.calls[0][0];
    expect(saved.secret).toBe('sec-xyz');
  });
});

describe('GET /api/tenants/:tenantId/trigger-subscriptions', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns list of subscriptions', async () => {
    listSubscriptionsForTenantMock.mockResolvedValue([
      { id: 's1', tenantId: 'T1', eventType: 'order.created', callbackUrl: 'http://ap/hook', createdAt: new Date() },
    ]);
    const res = await request(makeApp()).get('/api/tenants/T1/trigger-subscriptions');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(listSubscriptionsForTenantMock).toHaveBeenCalledWith('T1');
  });
});

describe('DELETE /api/tenants/:tenantId/trigger-subscriptions/:id', () => {
  beforeEach(() => vi.clearAllMocks());

  it('deletes subscription', async () => {
    deleteWebhookSubscriptionMock.mockResolvedValue(undefined);
    const res = await request(makeApp()).delete('/api/tenants/T1/trigger-subscriptions/sub-1');
    expect(res.status).toBe(200);
    expect(deleteWebhookSubscriptionMock).toHaveBeenCalledWith('sub-1');
  });
});
