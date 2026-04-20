import { beforeEach, describe, expect, it, vi } from 'vitest';

const { upsertMock, getMock, publishMock } = vi.hoisted(() => ({
  upsertMock: vi.fn<[unknown], Promise<void>>().mockResolvedValue(undefined),
  getMock:    vi.fn(),
  publishMock: vi.fn<[unknown], Promise<void>>().mockResolvedValue(undefined),
}));

vi.mock('@integrax/snapshot-store', () => ({
  hashPayload: (p: unknown) => JSON.stringify(p),
  SnapshotStore: class {},
}));

vi.mock('@integrax/event-bus', () => ({
  EventBus: class {},
}));

import { InventoryService } from '../inventory-service.js';

function makeService() {
  const store = { upsert: upsertMock, get: getMock, list: vi.fn(), getAll: vi.fn(), diff: vi.fn() };
  const bus   = { publish: publishMock, subscribe: vi.fn(), subscribeAll: vi.fn(), deadLetterQueue: vi.fn(), replayDlq: vi.fn() };
  return new InventoryService(store as never, bus as never);
}

function capturedUpsert() {
  return upsertMock.mock.calls.at(-1)?.[0] as Record<string, unknown> | undefined;
}

describe('InventoryService.reserveStock', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls store.upsert with correct canonicalId', async () => {
    const svc = makeService();
    await svc.reserveStock({ tenantId: 'T1', sourceSystem: 'orders', sku: 'SKU-001', quantity: 3, referenceId: 'order-abc' });
    expect(upsertMock).toHaveBeenCalledOnce();
    const snap = capturedUpsert()!;
    expect(snap['canonicalId']).toBe('T1:SKU-001:order-abc');
  });

  it('stores sku, quantity, referenceId in payload', async () => {
    const svc = makeService();
    await svc.reserveStock({ tenantId: 'T1', sourceSystem: 'orders', sku: 'SKU-001', quantity: 3, referenceId: 'order-abc' });
    const payload = capturedUpsert()!['payload'] as Record<string, unknown>;
    expect(payload['sku']).toBe('SKU-001');
    expect(payload['quantity']).toBe(3);
    expect(payload['referenceId']).toBe('order-abc');
    expect(payload['released']).toBeUndefined();
  });

  it('uses tenantId from input in snapshot', async () => {
    const svc = makeService();
    await svc.reserveStock({ tenantId: 'T2', sourceSystem: 'orders', sku: 'SKU-X', quantity: 5, referenceId: 'r1' });
    const snap = capturedUpsert()!;
    expect(snap['tenantId']).toBe('T2');
    expect(snap['canonicalId']).toBe('T2:SKU-X:r1');
  });

  it('publishes an event after reservation', async () => {
    const svc = makeService();
    await svc.reserveStock({ tenantId: 'T1', sourceSystem: 'orders', sku: 'SKU-001', quantity: 1, referenceId: 'r1' });
    expect(publishMock).toHaveBeenCalledOnce();
  });
});

describe('InventoryService.releaseReservation', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls store.upsert with released=true and quantity=0', async () => {
    getMock.mockResolvedValue({
      snapshotId: 'old', tenantId: 'T1', entityType: 'stock_reservation',
      canonicalId: 'T1:SKU-001:order-abc', externalIds: [], payloadHash: 'h',
      payload: { sku: 'SKU-001', quantity: 3, referenceId: 'order-abc' },
      sourceSystem: 'orders', updatedAtSource: new Date(), updatedAtSnapshot: new Date(),
    });

    const svc = makeService();
    await svc.releaseReservation({ tenantId: 'T1', sourceSystem: 'orders', sku: 'SKU-001', referenceId: 'order-abc' });

    expect(upsertMock).toHaveBeenCalledOnce();
    const payload = capturedUpsert()!['payload'] as Record<string, unknown>;
    expect(payload['released']).toBe(true);
    expect(payload['quantity']).toBe(0);
  });

  it('throws when reservation not found', async () => {
    getMock.mockResolvedValue(null);
    const svc = makeService();
    await expect(svc.releaseReservation({ tenantId: 'T1', sourceSystem: 'orders', sku: 'NOPE', referenceId: 'r99' }))
      .rejects.toThrow();
  });
});
