import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EntitySnapshot } from '@integrax/snapshot-store';

// ── Hoisted mocks ─────────────────────────────────────────────────────────────

const { listMock, publishMock } = vi.hoisted(() => ({
  listMock:    vi.fn<[], Promise<EntitySnapshot[]>>().mockResolvedValue([]),
  publishMock: vi.fn<[unknown], Promise<void>>().mockResolvedValue(undefined),
}));

vi.mock('@integrax/snapshot-store', () => ({
  SnapshotStore: class {},
}));

vi.mock('@integrax/event-bus', () => ({
  EventBus: class {},
}));

import { SnapshotConsistencyInspector } from '../inspector.js';

function snap(
  overrides: Partial<EntitySnapshot> & Pick<EntitySnapshot, 'canonicalId' | 'sourceSystem' | 'payload'>,
): EntitySnapshot {
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

function makeInspector() {
  const store = { upsert: vi.fn(), get: vi.fn(), list: listMock, getAll: vi.fn(), diff: vi.fn() };
  const bus   = { publish: publishMock, subscribe: vi.fn(), subscribeAll: vi.fn(), deadLetterQueue: vi.fn(), replayDlq: vi.fn() };
  return new SnapshotConsistencyInspector(store as never, bus as never);
}

// ── SnapshotConsistencyInspector.inspect ──────────────────────────────────────

describe('SnapshotConsistencyInspector.inspect', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns empty report when no snapshots', async () => {
    listMock.mockResolvedValue([]);
    const inspector = makeInspector();
    const report = await inspector.inspect('T1', 'product');
    expect(report.issues).toHaveLength(0);
    expect(report.summary.total).toBe(0);
    expect(report.tenantId).toBe('T1');
    expect(report.entityType).toBe('product');
  });

  it('returns no issues when all systems agree', async () => {
    listMock.mockResolvedValue([
      snap({ canonicalId: 'p1', sourceSystem: 'shopify',     entityType: 'product', payload: { price: 100, status: 'active' } }),
      snap({ canonicalId: 'p1', sourceSystem: 'contabilium', entityType: 'product', payload: { price: 100, status: 'active' } }),
    ]);
    const inspector = makeInspector();
    const report = await inspector.inspect('T1', 'product');
    expect(report.issues).toHaveLength(0);
  });

  it('detects price divergence between two systems', async () => {
    listMock.mockResolvedValue([
      snap({ canonicalId: 'p1', sourceSystem: 'shopify',     entityType: 'product', payload: { price: 100 } }),
      snap({ canonicalId: 'p1', sourceSystem: 'contabilium', entityType: 'product', payload: { price: 200 } }),
    ]);
    const inspector = makeInspector();
    const report = await inspector.inspect('T1', 'product');
    expect(report.issues.length).toBeGreaterThan(0);
    const priceIssue = report.issues.find(i => i.kind === 'price_divergence');
    expect(priceIssue).toBeDefined();
    expect(['shopify', 'contabilium']).toContain(priceIssue!.systemA);
  });

  it('detects stock divergence', async () => {
    listMock.mockResolvedValue([
      snap({ canonicalId: 's1', sourceSystem: 'wms',    entityType: 'stock', payload: { stock: 50 } }),
      snap({ canonicalId: 's1', sourceSystem: 'shopify', entityType: 'stock', payload: { stock: 30 } }),
    ]);
    const inspector = makeInspector();
    const report = await inspector.inspect('T1', 'stock');
    const stockIssue = report.issues.find(i => i.kind === 'stock_divergence');
    expect(stockIssue).toBeDefined();
  });

  it('detects state mismatch on status field', async () => {
    listMock.mockResolvedValue([
      snap({ canonicalId: 'o1', sourceSystem: 'shopify', entityType: 'order', payload: { status: 'shipped' } }),
      snap({ canonicalId: 'o1', sourceSystem: 'wms',     entityType: 'order', payload: { status: 'processing' } }),
    ]);
    const inspector = makeInspector();
    const report = await inspector.inspect('T1', 'order');
    const issue = report.issues.find(i => i.kind === 'state_mismatch');
    expect(issue).toBeDefined();
  });

  it('deduplicates by field — worst severity wins across pairs', async () => {
    listMock.mockResolvedValue([
      snap({ canonicalId: 'p2', sourceSystem: 'sys-A', entityType: 'product', payload: { price: 100 } }),
      snap({ canonicalId: 'p2', sourceSystem: 'sys-B', entityType: 'product', payload: { price: 200 } }),
      snap({ canonicalId: 'p2', sourceSystem: 'sys-C', entityType: 'product', payload: { price: 300 } }),
    ]);
    const inspector = makeInspector();
    const report = await inspector.inspect('T1', 'product');
    const priceIssues = report.issues.filter(i => i.kind === 'price_divergence');
    expect(priceIssues).toHaveLength(1);
  });

  it('emits conflict.detected event for each issue', async () => {
    listMock.mockResolvedValue([
      snap({ canonicalId: 'p1', sourceSystem: 'A', entityType: 'product', payload: { price: 10 } }),
      snap({ canonicalId: 'p1', sourceSystem: 'B', entityType: 'product', payload: { price: 99 } }),
    ]);
    const inspector = makeInspector();
    await inspector.inspect('T1', 'product');
    expect(publishMock).toHaveBeenCalled();
    const call = publishMock.mock.calls[0][0] as Record<string, unknown>;
    expect(call['type']).toBe('conflict.detected');
  });

  it('report summary total matches issues array length', async () => {
    listMock.mockResolvedValue([
      snap({ canonicalId: 'p1', sourceSystem: 'A', entityType: 'product', payload: { price: 10, status: 'active' } }),
      snap({ canonicalId: 'p1', sourceSystem: 'B', entityType: 'product', payload: { price: 99, status: 'inactive' } }),
    ]);
    const inspector = makeInspector();
    const report = await inspector.inspect('T1', 'product');
    expect(report.summary.total).toBe(report.issues.length);
  });

  it('summary bySeverity counts are consistent', async () => {
    listMock.mockResolvedValue([
      snap({ canonicalId: 'p1', sourceSystem: 'A', entityType: 'product', payload: { price: 10 } }),
      snap({ canonicalId: 'p1', sourceSystem: 'B', entityType: 'product', payload: { price: 5000 } }),
    ]);
    const inspector = makeInspector();
    const report = await inspector.inspect('T1', 'product');
    const countedBySeverity = Object.values(report.summary.bySeverity).reduce((a, b) => a + b, 0);
    expect(countedBySeverity).toBe(report.summary.total);
  });

  it('isolates tenants — T2 snapshots do not affect T1 report', async () => {
    // list is called with tenantId='T1' — just return empty for T1
    listMock.mockResolvedValue([]);
    const inspector = makeInspector();
    const report = await inspector.inspect('T1', 'product');
    expect(report.issues).toHaveLength(0);
    expect(listMock).toHaveBeenCalledWith('T1', 'product');
  });
});

// ── Entity-specific checks ────────────────────────────────────────────────────

describe('SnapshotConsistencyInspector — entity-specific checks', () => {
  beforeEach(() => vi.clearAllMocks());

  it('flags invoice as missing when only one system has a snapshot', async () => {
    listMock.mockResolvedValue([
      snap({ canonicalId: 'inv-1', sourceSystem: 'contabilium', entityType: 'invoice', payload: { status: 'authorized' } }),
    ]);
    const inspector = makeInspector();
    const report = await inspector.inspect('T1', 'invoice');
    const issue = report.issues.find(i => i.kind === 'invoice_missing');
    expect(issue).toBeDefined();
    expect(issue!.severity).toBe('HIGH');
  });

  it('does not flag invoice when two systems have the snapshot', async () => {
    listMock.mockResolvedValue([
      snap({ canonicalId: 'inv-2', sourceSystem: 'contabilium', entityType: 'invoice', payload: { status: 'authorized' } }),
      snap({ canonicalId: 'inv-2', sourceSystem: 'afip',        entityType: 'invoice', payload: { status: 'authorized' } }),
    ]);
    const inspector = makeInspector();
    const report = await inspector.inspect('T1', 'invoice');
    expect(report.issues.filter(i => i.kind === 'invoice_missing')).toHaveLength(0);
  });

  it('flags shipment as orphaned when no orderId is present', async () => {
    listMock.mockResolvedValue([
      snap({ canonicalId: 'ship-1', sourceSystem: 'wms', entityType: 'shipment', payload: { trackingId: 'TRK-9' } }),
    ]);
    const inspector = makeInspector();
    const report = await inspector.inspect('T1', 'shipment');
    const issue = report.issues.find(i => i.kind === 'shipment_orphaned');
    expect(issue).toBeDefined();
    expect(issue!.severity).toBe('MEDIUM');
  });

  it('does not flag shipment when orderId is present', async () => {
    listMock.mockResolvedValue([
      snap({ canonicalId: 'ship-2', sourceSystem: 'wms', entityType: 'shipment', payload: { orderId: 'ORD-1', trackingId: 'TRK-10' } }),
    ]);
    const inspector = makeInspector();
    const report = await inspector.inspect('T1', 'shipment');
    expect(report.issues.filter(i => i.kind === 'shipment_orphaned')).toHaveLength(0);
  });
});

// ── inspectAll ────────────────────────────────────────────────────────────────

describe('SnapshotConsistencyInspector.inspectAll', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listMock.mockResolvedValue([]);
  });

  it('returns reports for all supported entity types', async () => {
    const inspector = makeInspector();
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
    const inspector = makeInspector();
    const reports = await inspector.inspectAll('T1', { entityTypes: ['product', 'order'] });
    expect(reports).toHaveLength(2);
    expect(reports.map(r => r.entityType)).toEqual(['product', 'order']);
  });

  it('filters issues by severity', async () => {
    listMock.mockResolvedValue([
      snap({ canonicalId: 'p1', sourceSystem: 'A', entityType: 'product', payload: { price: 100 } }),
      snap({ canonicalId: 'p1', sourceSystem: 'B', entityType: 'product', payload: { price: 5000 } }),
    ]);
    const inspector = makeInspector();
    const reports = await inspector.inspectAll('T1', { entityTypes: ['product'], severity: ['CRITICAL'] });
    const allIssues = reports.flatMap(r => r.issues);
    expect(allIssues.every(i => i.severity === 'CRITICAL')).toBe(true);
  });
});
