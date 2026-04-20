import { describe, it, expect } from 'vitest';
import { InMemorySnapshotStore } from '@integrax/snapshot-store';
import { InMemoryEventBus } from '@integrax/event-bus';
import { SnapshotConsistencyInspector } from '../inspector.js';
import type { EntitySnapshot } from '@integrax/snapshot-store';

function snap(overrides: Partial<EntitySnapshot> & Pick<EntitySnapshot, 'canonicalId' | 'sourceSystem' | 'payload'>): EntitySnapshot {
  return {
    snapshotId: `snap-${Math.random().toString(36).slice(2)}`,
    tenantId: 'T1',
    entityType: 'product',
    externalIds: [],
    payloadHash: 'x',
    updatedAtSource: new Date('2025-01-01'),
    updatedAtSnapshot: new Date('2025-01-01'),
    ...overrides,
  };
}

async function upsertSnap(store: InMemorySnapshotStore, s: EntitySnapshot) {
  await store.upsert(s);
}

function makeInspector() {
  const store = new InMemorySnapshotStore();
  const bus = new InMemoryEventBus();
  const inspector = new SnapshotConsistencyInspector(store, bus);
  return { store, bus, inspector };
}

describe('SnapshotConsistencyInspector.inspect', () => {
  it('returns empty report when no snapshots', async () => {
    const { inspector } = makeInspector();
    const report = await inspector.inspect('T1', 'product');
    expect(report.issues).toHaveLength(0);
    expect(report.summary.total).toBe(0);
    expect(report.tenantId).toBe('T1');
    expect(report.entityType).toBe('product');
  });

  it('returns no issues when all systems agree', async () => {
    const { store, inspector } = makeInspector();
    await upsertSnap(store, snap({ canonicalId: 'p1', sourceSystem: 'shopify', entityType: 'product', payload: { price: 100, status: 'active' } }));
    await upsertSnap(store, snap({ canonicalId: 'p1', sourceSystem: 'contabilium', entityType: 'product', payload: { price: 100, status: 'active' } }));

    const report = await inspector.inspect('T1', 'product');
    expect(report.issues).toHaveLength(0);
  });

  it('detects price divergence between two systems', async () => {
    const { store, inspector } = makeInspector();
    await upsertSnap(store, snap({ canonicalId: 'p1', sourceSystem: 'shopify', entityType: 'product', payload: { price: 100 } }));
    await upsertSnap(store, snap({ canonicalId: 'p1', sourceSystem: 'contabilium', entityType: 'product', payload: { price: 200 } }));

    const report = await inspector.inspect('T1', 'product');
    expect(report.issues.length).toBeGreaterThan(0);
    const priceIssue = report.issues.find(i => i.kind === 'price_divergence');
    expect(priceIssue).toBeDefined();
    expect(['shopify', 'contabilium']).toContain(priceIssue!.systemA);
  });

  it('detects stock divergence', async () => {
    const { store, inspector } = makeInspector();
    await upsertSnap(store, snap({ canonicalId: 's1', sourceSystem: 'wms', entityType: 'stock', payload: { stock: 50 } }));
    await upsertSnap(store, snap({ canonicalId: 's1', sourceSystem: 'shopify', entityType: 'stock', payload: { stock: 30 } }));

    const report = await inspector.inspect('T1', 'stock');
    const stockIssue = report.issues.find(i => i.kind === 'stock_divergence');
    expect(stockIssue).toBeDefined();
  });

  it('detects state mismatch on status field', async () => {
    const { store, inspector } = makeInspector();
    await upsertSnap(store, snap({ canonicalId: 'o1', sourceSystem: 'shopify', entityType: 'order', payload: { status: 'shipped' } }));
    await upsertSnap(store, snap({ canonicalId: 'o1', sourceSystem: 'wms', entityType: 'order', payload: { status: 'processing' } }));

    const report = await inspector.inspect('T1', 'order');
    const issue = report.issues.find(i => i.kind === 'state_mismatch');
    expect(issue).toBeDefined();
  });

  it('deduplicates by field — worst severity wins across pairs', async () => {
    const { store, inspector } = makeInspector();
    // Three systems — all diverge on 'price'. Should produce one issue for price, not 3 (C(3,2)=3 pairs).
    await upsertSnap(store, snap({ canonicalId: 'p2', sourceSystem: 'sys-A', entityType: 'product', payload: { price: 100 } }));
    await upsertSnap(store, snap({ canonicalId: 'p2', sourceSystem: 'sys-B', entityType: 'product', payload: { price: 200 } }));
    await upsertSnap(store, snap({ canonicalId: 'p2', sourceSystem: 'sys-C', entityType: 'product', payload: { price: 300 } }));

    const report = await inspector.inspect('T1', 'product');
    // All pairs diverge on 'price', but we deduplicate by field → 1 issue
    const priceIssues = report.issues.filter(i => i.kind === 'price_divergence');
    expect(priceIssues).toHaveLength(1);
  });

  it('emits conflict.detected event for each issue', async () => {
    const { store, bus, inspector } = makeInspector();
    const received: unknown[] = [];
    bus.subscribe('conflict.detected', async (ev) => { received.push(ev); });

    await upsertSnap(store, snap({ canonicalId: 'p1', sourceSystem: 'A', entityType: 'product', payload: { price: 10 } }));
    await upsertSnap(store, snap({ canonicalId: 'p1', sourceSystem: 'B', entityType: 'product', payload: { price: 99 } }));

    await inspector.inspect('T1', 'product');
    expect(received.length).toBeGreaterThan(0);
  });

  it('report summary total matches issues array length', async () => {
    const { store, inspector } = makeInspector();
    await upsertSnap(store, snap({ canonicalId: 'p1', sourceSystem: 'A', entityType: 'product', payload: { price: 10, status: 'active' } }));
    await upsertSnap(store, snap({ canonicalId: 'p1', sourceSystem: 'B', entityType: 'product', payload: { price: 99, status: 'inactive' } }));

    const report = await inspector.inspect('T1', 'product');
    expect(report.summary.total).toBe(report.issues.length);
  });

  it('summary bySeverity counts are consistent', async () => {
    const { store, inspector } = makeInspector();
    await upsertSnap(store, snap({ canonicalId: 'p1', sourceSystem: 'A', entityType: 'product', payload: { price: 10 } }));
    await upsertSnap(store, snap({ canonicalId: 'p1', sourceSystem: 'B', entityType: 'product', payload: { price: 5000 } }));

    const report = await inspector.inspect('T1', 'product');
    const countedBySeverity = Object.values(report.summary.bySeverity).reduce((a, b) => a + b, 0);
    expect(countedBySeverity).toBe(report.summary.total);
  });

  it('isolates tenants — T2 snapshots do not affect T1 report', async () => {
    const { store, inspector } = makeInspector();
    await store.upsert(snap({ canonicalId: 'p1', sourceSystem: 'A', entityType: 'product', tenantId: 'T2', payload: { price: 100 } }));
    await store.upsert(snap({ canonicalId: 'p1', sourceSystem: 'B', entityType: 'product', tenantId: 'T2', payload: { price: 500 } }));

    const report = await inspector.inspect('T1', 'product');
    expect(report.issues).toHaveLength(0);
  });
});

describe('SnapshotConsistencyInspector — entity-specific checks', () => {
  it('flags invoice as missing when only one system has a snapshot', async () => {
    const { store, inspector } = makeInspector();
    await upsertSnap(store, snap({ canonicalId: 'inv-1', sourceSystem: 'contabilium', entityType: 'invoice', payload: { status: 'authorized' } }));

    const report = await inspector.inspect('T1', 'invoice');
    const issue = report.issues.find(i => i.kind === 'invoice_missing');
    expect(issue).toBeDefined();
    expect(issue!.severity).toBe('HIGH');
  });

  it('does not flag invoice when two systems have the snapshot', async () => {
    const { store, inspector } = makeInspector();
    await upsertSnap(store, snap({ canonicalId: 'inv-2', sourceSystem: 'contabilium', entityType: 'invoice', payload: { status: 'authorized' } }));
    await upsertSnap(store, snap({ canonicalId: 'inv-2', sourceSystem: 'afip', entityType: 'invoice', payload: { status: 'authorized' } }));

    const report = await inspector.inspect('T1', 'invoice');
    const missingIssues = report.issues.filter(i => i.kind === 'invoice_missing');
    expect(missingIssues).toHaveLength(0);
  });

  it('flags shipment as orphaned when no orderId is present', async () => {
    const { store, inspector } = makeInspector();
    await upsertSnap(store, snap({ canonicalId: 'ship-1', sourceSystem: 'wms', entityType: 'shipment', payload: { trackingId: 'TRK-9' } }));

    const report = await inspector.inspect('T1', 'shipment');
    const issue = report.issues.find(i => i.kind === 'shipment_orphaned');
    expect(issue).toBeDefined();
    expect(issue!.severity).toBe('MEDIUM');
  });

  it('does not flag shipment when orderId is present', async () => {
    const { store, inspector } = makeInspector();
    await upsertSnap(store, snap({ canonicalId: 'ship-2', sourceSystem: 'wms', entityType: 'shipment', payload: { orderId: 'ORD-1', trackingId: 'TRK-10' } }));

    const report = await inspector.inspect('T1', 'shipment');
    const orphanIssues = report.issues.filter(i => i.kind === 'shipment_orphaned');
    expect(orphanIssues).toHaveLength(0);
  });
});

describe('SnapshotConsistencyInspector.inspectAll', () => {
  it('returns reports for all supported entity types', async () => {
    const { inspector } = makeInspector();
    const reports = await inspector.inspectAll('T1');
    const types = reports.map(r => r.entityType);
    expect(types).toContain('product');
    expect(types).toContain('order');
    expect(types).toContain('invoice');
    expect(types).toContain('customer');
    expect(types).toContain('stock');
    expect(types).toContain('shipment');
  });

  it('respects entityTypes filter', async () => {
    const { inspector } = makeInspector();
    const reports = await inspector.inspectAll('T1', { entityTypes: ['product', 'order'] });
    expect(reports).toHaveLength(2);
    expect(reports.map(r => r.entityType)).toEqual(['product', 'order']);
  });

  it('filters issues by severity', async () => {
    const { store, inspector } = makeInspector();
    await upsertSnap(store, snap({ canonicalId: 'p1', sourceSystem: 'A', entityType: 'product', payload: { price: 100 } }));
    await upsertSnap(store, snap({ canonicalId: 'p1', sourceSystem: 'B', entityType: 'product', payload: { price: 5000 } }));

    const reports = await inspector.inspectAll('T1', { entityTypes: ['product'], severity: ['CRITICAL'] });
    const allIssues = reports.flatMap(r => r.issues);
    expect(allIssues.every(i => i.severity === 'CRITICAL')).toBe(true);
  });
});
