/**
 * ActivepiecesBridge tests
 *
 * Tests fanout-via-flow-mappings and fanout-via-webhook-subscriptions.
 * No real HTTP calls — fetch is mocked; store functions are mocked.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── Hoisted mocks ─────────────────────────────────────────────────────────────

const {
  getActiveFlowMappingsByEventMock,
  getSubscriptionsByEventMock,
  triggerFlowMock,
  subscribeAllCb,
} = vi.hoisted(() => {
  let _cb: ((ev: unknown) => Promise<void>) | null = null;
  return {
    getActiveFlowMappingsByEventMock: vi.fn(),
    getSubscriptionsByEventMock: vi.fn(),
    triggerFlowMock: vi.fn<[unknown], Promise<{ runId: string }>>().mockResolvedValue({ runId: 'run-1' }),
    subscribeAllCb: {
      set(fn: (ev: unknown) => Promise<void>) { _cb = fn; },
      call(ev: unknown) { return _cb ? _cb(ev) : Promise.resolve(); },
    },
  };
});

vi.mock('../store/tenant-flow-mappings.js', () => ({
  getActiveFlowMappingsByEvent: getActiveFlowMappingsByEventMock,
}));

vi.mock('../store/webhook-trigger-subscriptions.js', () => ({
  getSubscriptionsByEvent: getSubscriptionsByEventMock,
}));

vi.mock('@integrax/integration-engine', () => ({
  ActivepiecesAdapter: class {
    triggerFlow = triggerFlowMock;
    getRunStatus = vi.fn();
    cancelRun = vi.fn();
    listFlows = vi.fn();
    enableFlow = vi.fn();
    disableFlow = vi.fn();
  },
}));

vi.mock('./container/event-bus.js', () => ({
  eventBus: {
    subscribeAll: vi.fn((fn: (ev: unknown) => Promise<void>) => {
      subscribeAllCb.set(fn);
      return () => {};
    }),
  },
  eventBusReady: Promise.resolve(),
}));

import { registerActivepiecesBridge } from './activepieces-bridge.js';
import type { IntegraxEvent } from '@integrax/event-bus';

function makeEvent(overrides: Partial<IntegraxEvent> = {}): IntegraxEvent {
  return {
    id: 'ev-1',
    type: 'order.created',
    tenantId: 'T1',
    sourceSystem: 'orders',
    entityType: 'order',
    entityId: 'ord-1',
    payload: {},
    occurredAt: new Date(),
    ...overrides,
  };
}

describe('ActivepiecesBridge — webhook subscription fanout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getActiveFlowMappingsByEventMock.mockResolvedValue([]);
    getSubscriptionsByEventMock.mockResolvedValue([]);
  });

  it('does nothing when no subscriptions match the tenant', async () => {
    getSubscriptionsByEventMock.mockResolvedValue([
      { id: 's1', tenantId: 'OTHER', eventType: 'order.created', callbackUrl: 'http://ap/hook', createdAt: new Date() },
    ]);

    // No ACTIVEPIECES env vars → adapter is null
    delete process.env.ACTIVEPIECES_BASE_URL;
    delete process.env.ACTIVEPIECES_API_KEY;
    registerActivepiecesBridge();

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 200 }));
    await subscribeAllCb.call(makeEvent({ tenantId: 'T1' }));
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('calls callbackUrl when tenantId matches', async () => {
    getSubscriptionsByEventMock.mockResolvedValue([
      { id: 's1', tenantId: 'T1', eventType: 'order.created', callbackUrl: 'http://ap/hook', createdAt: new Date() },
    ]);

    delete process.env.ACTIVEPIECES_BASE_URL;
    delete process.env.ACTIVEPIECES_API_KEY;
    registerActivepiecesBridge();

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 200 }));
    await subscribeAllCb.call(makeEvent({ tenantId: 'T1' }));
    expect(fetchSpy).toHaveBeenCalledOnce();
    expect(fetchSpy.mock.calls[0][0]).toBe('http://ap/hook');
    fetchSpy.mockRestore();
  });

  it('sends X-IntegraX-Secret header when subscription has a secret', async () => {
    getSubscriptionsByEventMock.mockResolvedValue([
      { id: 's1', tenantId: 'T1', eventType: 'order.created', callbackUrl: 'http://ap/hook', secret: 'sec-123', createdAt: new Date() },
    ]);

    delete process.env.ACTIVEPIECES_BASE_URL;
    delete process.env.ACTIVEPIECES_API_KEY;
    registerActivepiecesBridge();

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 200 }));
    await subscribeAllCb.call(makeEvent({ tenantId: 'T1' }));
    const headers = fetchSpy.mock.calls[0][1]?.headers as Record<string, string>;
    expect(headers['X-IntegraX-Secret']).toBe('sec-123');
    fetchSpy.mockRestore();
  });

  it('fans out to multiple matching subscribers', async () => {
    getSubscriptionsByEventMock.mockResolvedValue([
      { id: 's1', tenantId: 'T1', eventType: 'order.created', callbackUrl: 'http://ap/hook1', createdAt: new Date() },
      { id: 's2', tenantId: 'T1', eventType: 'order.created', callbackUrl: 'http://ap/hook2', createdAt: new Date() },
    ]);

    delete process.env.ACTIVEPIECES_BASE_URL;
    delete process.env.ACTIVEPIECES_API_KEY;
    registerActivepiecesBridge();

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 200 }));
    await subscribeAllCb.call(makeEvent({ tenantId: 'T1' }));
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    fetchSpy.mockRestore();
  });

  it('does not crash when fetch fails (fire-and-forget)', async () => {
    getSubscriptionsByEventMock.mockResolvedValue([
      { id: 's1', tenantId: 'T1', eventType: 'order.created', callbackUrl: 'http://bad', createdAt: new Date() },
    ]);

    delete process.env.ACTIVEPIECES_BASE_URL;
    delete process.env.ACTIVEPIECES_API_KEY;
    registerActivepiecesBridge();

    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'));
    await expect(subscribeAllCb.call(makeEvent({ tenantId: 'T1' }))).resolves.not.toThrow();
    vi.spyOn(globalThis, 'fetch').mockRestore();
  });
});

describe('ActivepiecesBridge — flow mapping fanout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSubscriptionsByEventMock.mockResolvedValue([]);
  });

  it('triggers flow when mapping matches tenant', async () => {
    getActiveFlowMappingsByEventMock.mockResolvedValue([
      { id: 'm1', tenantId: 'T1', eventType: 'order.created', flowId: 'flow-abc', enabled: true, createdAt: new Date(), updatedAt: new Date() },
    ]);

    process.env.ACTIVEPIECES_BASE_URL = 'http://ap';
    process.env.ACTIVEPIECES_API_KEY  = 'key';
    registerActivepiecesBridge();

    await subscribeAllCb.call(makeEvent({ tenantId: 'T1' }));
    expect(triggerFlowMock).toHaveBeenCalledWith(
      expect.objectContaining({ flowId: 'flow-abc', tenantId: 'T1' }),
    );

    delete process.env.ACTIVEPIECES_BASE_URL;
    delete process.env.ACTIVEPIECES_API_KEY;
  });

  it('does not trigger flow when tenant does not match', async () => {
    getActiveFlowMappingsByEventMock.mockResolvedValue([
      { id: 'm1', tenantId: 'OTHER', eventType: 'order.created', flowId: 'flow-abc', enabled: true, createdAt: new Date(), updatedAt: new Date() },
    ]);

    process.env.ACTIVEPIECES_BASE_URL = 'http://ap';
    process.env.ACTIVEPIECES_API_KEY  = 'key';
    registerActivepiecesBridge();

    await subscribeAllCb.call(makeEvent({ tenantId: 'T1' }));
    expect(triggerFlowMock).not.toHaveBeenCalled();

    delete process.env.ACTIVEPIECES_BASE_URL;
    delete process.env.ACTIVEPIECES_API_KEY;
  });

  it('skips flow mapping mode when ACTIVEPIECES_BASE_URL is missing', async () => {
    getActiveFlowMappingsByEventMock.mockResolvedValue([
      { id: 'm1', tenantId: 'T1', eventType: 'order.created', flowId: 'flow-xyz', enabled: true, createdAt: new Date(), updatedAt: new Date() },
    ]);

    delete process.env.ACTIVEPIECES_BASE_URL;
    delete process.env.ACTIVEPIECES_API_KEY;
    registerActivepiecesBridge();

    await subscribeAllCb.call(makeEvent({ tenantId: 'T1' }));
    expect(triggerFlowMock).not.toHaveBeenCalled();
  });

  afterEach(() => {
    delete process.env.ACTIVEPIECES_BASE_URL;
    delete process.env.ACTIVEPIECES_API_KEY;
  });
});
