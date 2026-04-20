/**
 * Inventory reservation persistence tests
 *
 * Verifies that reserveStock / releaseReservation use the snapshot store
 * rather than in-memory state — reservations survive across service instances.
 */

import { describe, it, expect } from 'vitest';
import { InMemorySnapshotStore } from '@integrax/snapshot-store';
import { InMemoryEventBus } from '@integrax/event-bus';
import { InventoryService } from '../inventory-service.js';

function makeService() {
  const store = new InMemorySnapshotStore();
  const bus = new InMemoryEventBus();
  const service = new InventoryService(store, bus);
  return { store, bus, service };
}

describe('InventoryService reservations', () => {
  it('reserves stock by writing to snapshot store', async () => {
    const { store, service } = makeService();

    await service.reserveStock({
      tenantId: 'T1',
      sourceSystem: 'orders',
      sku: 'SKU-001',
      quantity: 3,
      referenceId: 'order-abc',
    });

    const canonicalId = 'T1:SKU-001:order-abc';
    const snap = await store.get('T1', 'stock_reservation', canonicalId);
    expect(snap).not.toBeNull();
    expect(snap!.payload['sku']).toBe('SKU-001');
    expect(snap!.payload['quantity']).toBe(3);
    expect(snap!.payload['referenceId']).toBe('order-abc');
    expect(snap!.payload['released']).toBeUndefined();
  });

  it('releases reservation by writing a tombstone with released=true and quantity=0', async () => {
    const { store, service } = makeService();

    await service.reserveStock({
      tenantId: 'T1',
      sourceSystem: 'orders',
      sku: 'SKU-001',
      quantity: 3,
      referenceId: 'order-abc',
    });

    await service.releaseReservation({
      tenantId: 'T1',
      sourceSystem: 'orders',
      sku: 'SKU-001',
      referenceId: 'order-abc',
    });

    const snap = await store.get('T1', 'stock_reservation', 'T1:SKU-001:order-abc');
    expect(snap).not.toBeNull();
    expect(snap!.payload['released']).toBe(true);
    expect(snap!.payload['quantity']).toBe(0);
  });

  it('separate tenants have isolated reservations', async () => {
    const { store, service } = makeService();

    await service.reserveStock({ tenantId: 'T1', sourceSystem: 's', sku: 'SKU-X', quantity: 5, referenceId: 'r1' });
    await service.reserveStock({ tenantId: 'T2', sourceSystem: 's', sku: 'SKU-X', quantity: 2, referenceId: 'r1' });

    const t1 = await store.get('T1', 'stock_reservation', 'T1:SKU-X:r1');
    const t2 = await store.get('T2', 'stock_reservation', 'T2:SKU-X:r1');

    expect(t1!.payload['quantity']).toBe(5);
    expect(t2!.payload['quantity']).toBe(2);
  });

  it('reservation survives creating a second InventoryService instance (shared store)', async () => {
    const store = new InMemorySnapshotStore();
    const bus = new InMemoryEventBus();

    const svc1 = new InventoryService(store, bus);
    await svc1.reserveStock({ tenantId: 'T1', sourceSystem: 's', sku: 'SKU-Y', quantity: 1, referenceId: 'r2' });

    // New instance sharing the same store — simulates restart or second replica
    new InventoryService(store, bus);
    const snap = await store.get('T1', 'stock_reservation', 'T1:SKU-Y:r2');
    expect(snap).not.toBeNull();
    expect(snap!.payload['quantity']).toBe(1);
  });
});
