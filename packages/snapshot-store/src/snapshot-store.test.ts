import { describe, it, expect } from 'vitest';
import { InMemorySnapshotStore } from './in-memory-store.js';
import { hashPayload } from './hash.js';
import type { EntitySnapshot } from './types.js';

function snap(overrides: Partial<EntitySnapshot> = {}): EntitySnapshot {
  return {
    snapshotId: 'snap-1',
    tenantId: 'tenant-a',
    entityType: 'product',
    canonicalId: 'canon-1',
    externalIds: [{ system: 'mercadopago', id: 'MLA-123' }],
    payloadHash: 'abc',
    payload: { sku: 'SKU-1', price: 1000, stock: 10 },
    sourceSystem: 'mercadopago',
    updatedAtSource: new Date('2025-01-01'),
    updatedAtSnapshot: new Date('2025-01-01'),
    ...overrides,
  };
}

describe('InMemorySnapshotStore', () => {
  it('upsert + get returns the snapshot', async () => {
    const store = new InMemorySnapshotStore();
    await store.upsert(snap());
    const result = await store.get('tenant-a', 'product', 'canon-1');
    expect(result).not.toBeNull();
    expect(result!.canonicalId).toBe('canon-1');
  });

  it('get returns null when not found', async () => {
    const store = new InMemorySnapshotStore();
    expect(await store.get('tenant-a', 'product', 'missing')).toBeNull();
  });

  it('upsert overwrites the same source system', async () => {
    const store = new InMemorySnapshotStore();
    await store.upsert(snap({ payload: { price: 100 } }));
    await store.upsert(snap({ snapshotId: 'snap-2', payload: { price: 200 }, updatedAtSnapshot: new Date('2025-01-02') }));
    const result = await store.get('tenant-a', 'product', 'canon-1');
    expect(result!.payload.price).toBe(200);
  });

  it('getAll returns one entry per source system', async () => {
    const store = new InMemorySnapshotStore();
    await store.upsert(snap({ snapshotId: 's1', sourceSystem: 'mercadopago' }));
    await store.upsert(snap({ snapshotId: 's2', sourceSystem: 'contabilium' }));
    const all = await store.getAll('tenant-a', 'product', 'canon-1');
    expect(all).toHaveLength(2);
    expect(new Set(all.map(s => s.sourceSystem))).toEqual(new Set(['mercadopago', 'contabilium']));
  });

  it('list filters by sourceSystem', async () => {
    const store = new InMemorySnapshotStore();
    await store.upsert(snap({ snapshotId: 's1', sourceSystem: 'mercadopago' }));
    await store.upsert(snap({ snapshotId: 's2', sourceSystem: 'contabilium' }));
    const result = await store.list('tenant-a', 'product', { sourceSystem: 'contabilium' });
    expect(result).toHaveLength(1);
    expect(result[0].sourceSystem).toBe('contabilium');
  });

  it('list respects limit', async () => {
    const store = new InMemorySnapshotStore();
    for (let i = 0; i < 5; i++) {
      await store.upsert(snap({
        snapshotId: `s${i}`,
        canonicalId: `canon-${i}`,
        updatedAtSnapshot: new Date(2025, 0, i + 1),
      }));
    }
    const result = await store.list('tenant-a', 'product', { limit: 3 });
    expect(result).toHaveLength(3);
  });

  it('diff detects changed field', () => {
    const store = new InMemorySnapshotStore();
    const a = snap({ sourceSystem: 'mercadopago', payload: { price: 1000 } });
    const b = snap({ sourceSystem: 'contabilium', payload: { price: 1200 } });
    const result = store.diff(a, b);
    expect(result.hasConflicts).toBe(true);
    expect(result.conflicts[0].field).toBe('price');
  });

  it('diff returns no conflicts for identical payloads', () => {
    const store = new InMemorySnapshotStore();
    const a = snap({ sourceSystem: 'mp', payload: { sku: 'X', price: 100 } });
    const b = snap({ sourceSystem: 'cont', payload: { sku: 'X', price: 100 } });
    expect(store.diff(a, b).hasConflicts).toBe(false);
  });
});

describe('hashPayload', () => {
  it('produces same hash for key-order-insensitive objects', () => {
    const a = hashPayload({ b: 2, a: 1 });
    const b = hashPayload({ a: 1, b: 2 });
    expect(a).toBe(b);
  });

  it('produces different hashes for different values', () => {
    expect(hashPayload({ price: 100 })).not.toBe(hashPayload({ price: 200 }));
  });
});
