/**
 * Integration tests — Adversarial: false positive prevention
 *
 * El motor NO debe auto-aceptar mappings cuando la evidencia es insuficiente.
 * Estos tests verifican que sparse data, placeholder values, zero-overlap
 * y low-entropy collisions NO producen auto-accepts incorrectos.
 */
import { describe, it, expect } from 'vitest';
import { SchemaBridge } from '../../src/bridge.js';

const bridge = new SchemaBridge({ autoAcceptThreshold: 0.88, humanReviewThreshold: 0.70, decisionPolicy: { autoAcceptThreshold: 0.88, reviewThreshold: 0.70 } });

type Report = Awaited<ReturnType<typeof bridge.compare>>;

function autoAcceptedRenames(report: Report) {
  return report.mappings.filter(m => m.transform.kind === 'rename');
}

function hasRename(report: Report, pathA: string, pathB: string): boolean {
  return autoAcceptedRenames(report).some(m => m.pathA === pathA && m.pathB === pathB);
}

function sparseWindow(prefix: string, real: string[]): Array<string | null> {
  return Array.from({ length: 50 }, (_, i) => (i < real.length ? `${prefix}-${real[i]}` : null));
}

const legacyIds = sparseWindow('LEG', ['001', '002', '003', '004', '005']);
const modernIds = sparseWindow('LEG', ['001', '002', '003', '004', '005']);

describe('Adversarial — Sparse Data', () => {
  it('does not auto-accept fields with mostly-null values', async () => {
    const report = await bridge.compare({
      connectorAId: 'sparse-a',
      connectorBId: 'sparse-b',
      samplesA: Array.from({ length: 50 }, (_, i) => ({
        legacy_customer_id: legacyIds[i],
        note: i < 45 ? 'N/A' : `manual-${i}`,
        comments: null,
      })),
      samplesB: Array.from({ length: 50 }, (_, i) => ({
        customerId: modernIds[i],
        comment: i < 45 ? 'N/A' : `manual-${i}`,
        remarks: null,
      })),
    });

    expect(hasRename(report, 'note', 'comment')).toBe(false);
    expect(hasRename(report, 'comments', 'remarks')).toBe(false);
    expect(autoAcceptedRenames(report).some(m => m.pathA === 'note')).toBe(false);
    expect(autoAcceptedRenames(report).some(m => m.pathA === 'comments')).toBe(false);
  });
});

describe('Adversarial — Placeholder Swamping', () => {
  it('auto-accepts the real match but NOT the placeholder fields', async () => {
    const report = await bridge.compare({
      connectorAId: 'placeholder-a',
      connectorBId: 'placeholder-b',
      samplesA: Array.from({ length: 50 }, (_, i) => ({
        order_ref: `ORD-${(i + 1).toString().padStart(3, '0')}`,
        note: 'N/A',
        comment: i % 10 === 0 ? 'TBD' : '-',
      })),
      samplesB: Array.from({ length: 50 }, (_, i) => ({
        orderId: `ORD-${(i + 1).toString().padStart(3, '0')}`,
        internalNote: 'N/A',
        freeText: i % 10 === 0 ? 'TBD' : '-',
      })),
    });

    expect(hasRename(report, 'order_ref', 'orderId')).toBe(true);
    expect(autoAcceptedRenames(report).some(m => m.pathA === 'note')).toBe(false);
    expect(autoAcceptedRenames(report).some(m => m.pathA === 'comment')).toBe(false);
  });
});

describe('Adversarial — Zero-Overlap Windows', () => {
  it('does not auto-accept IDs from disjoint value ranges', async () => {
    const report = await bridge.compare({
      connectorAId: 'zero-overlap-a',
      connectorBId: 'zero-overlap-b',
      samplesA: Array.from({ length: 50 }, (_, i) => ({
        legacy_customer_id: `CUST-A-${(i + 1).toString().padStart(3, '0')}`,
        tenant_code: `TENANT-${(i % 5) + 1}`,
      })),
      samplesB: Array.from({ length: 50 }, (_, i) => ({
        customerId: `CUST-B-${(i + 51).toString().padStart(3, '0')}`,
        tenantId: `TENANT-${(i % 5) + 1}`,
      })),
    });

    // CUST-A-* and CUST-B-* share no values — should NOT auto-accept
    expect(hasRename(report, 'legacy_customer_id', 'customerId')).toBe(false);
  });
});

describe('Adversarial — Multiple High-Entropy IDs (no cross-matches)', () => {
  const samplesA = [
    { buyer_uuid: '550e8400-e29b-41d4-a716-446655440000', seller_uuid: '660e8400-e29b-41d4-a716-446655440000', tenant_uuid: '770e8400-e29b-41d4-a716-446655440000' },
    { buyer_uuid: '550e8400-e29b-41d4-a716-446655440001', seller_uuid: '660e8400-e29b-41d4-a716-446655440001', tenant_uuid: '770e8400-e29b-41d4-a716-446655440001' },
    { buyer_uuid: '550e8400-e29b-41d4-a716-446655440002', seller_uuid: '660e8400-e29b-41d4-a716-446655440002', tenant_uuid: '770e8400-e29b-41d4-a716-446655440002' },
    { buyer_uuid: '550e8400-e29b-41d4-a716-446655440003', seller_uuid: '660e8400-e29b-41d4-a716-446655440003', tenant_uuid: '770e8400-e29b-41d4-a716-446655440003' },
    { buyer_uuid: '550e8400-e29b-41d4-a716-446655440004', seller_uuid: '660e8400-e29b-41d4-a716-446655440004', tenant_uuid: '770e8400-e29b-41d4-a716-446655440004' },
  ];
  const samplesB = samplesA.map(s => ({
    buyerId: s.buyer_uuid, sellerId: s.seller_uuid, tenantId: s.tenant_uuid,
  }));

  it('correctly maps each UUID to its counterpart', async () => {
    const report = await bridge.compare({ connectorAId: 'uuid-a', connectorBId: 'uuid-b', samplesA, samplesB });
    expect(hasRename(report, 'buyer_uuid', 'buyerId')).toBe(true);
    expect(hasRename(report, 'seller_uuid', 'sellerId')).toBe(true);
    expect(hasRename(report, 'tenant_uuid', 'tenantId')).toBe(true);
  });

  it('does NOT cross-map buyer → seller or buyer → tenant', async () => {
    const report = await bridge.compare({ connectorAId: 'uuid-a', connectorBId: 'uuid-b', samplesA, samplesB });
    expect(hasRename(report, 'buyer_uuid', 'sellerId')).toBe(false);
    expect(hasRename(report, 'buyer_uuid', 'tenantId')).toBe(false);
    expect(hasRename(report, 'seller_uuid', 'buyerId')).toBe(false);
  });
});

describe('Adversarial — Flattened vs Nested (correct mapping, not false match)', () => {
  const samplesA = [
    { order_lines: [{ sku_code: 'SKU-100', component_code: 'CMP-100', component_desc: 'Valve Kit' }] },
    { order_lines: [{ sku_code: 'SKU-200', component_code: 'CMP-200', component_desc: 'Rotor Kit' }] },
    { order_lines: [{ sku_code: 'SKU-300', component_code: 'CMP-300', component_desc: 'Seal Kit' }] },
  ];
  const samplesB = [
    { order: { lines: [{ sku: 'SKU-100', components: [{ id: 'CMP-100', description: 'Valve Kit' }] }] } },
    { order: { lines: [{ sku: 'SKU-200', components: [{ id: 'CMP-200', description: 'Rotor Kit' }] }] } },
    { order: { lines: [{ sku: 'SKU-300', components: [{ id: 'CMP-300', description: 'Seal Kit' }] }] } },
  ];

  it('maps sku_code → sku and component_code → id correctly', async () => {
    const report = await bridge.compare({ connectorAId: 'flat-a', connectorBId: 'nested-b', samplesA, samplesB });
    expect(hasRename(report, 'order_lines[*].sku_code', 'order.lines[*].sku')).toBe(true);
    expect(hasRename(report, 'order_lines[*].component_code', 'order.lines[*].components[*].id')).toBe(true);
  });

  it('does NOT cross-map sku_code → description', async () => {
    const report = await bridge.compare({ connectorAId: 'flat-a', connectorBId: 'nested-b', samplesA, samplesB });
    expect(hasRename(report, 'order_lines[*].sku_code', 'order.lines[*].components[*].description')).toBe(false);
  });
});

describe('Adversarial — Mixed-Type Noise (boolean vs integer flag)', () => {
  it('does NOT auto-accept quality_flag → confidenceFlag (different types, low value overlap)', async () => {
    const report = await bridge.compare({
      connectorAId: 'mixed-a',
      connectorBId: 'mixed-b',
      samplesA: [
        { order_total: '100.50', order_status: 'approved', quality_flag: 1 },
        { order_total: 101.5, order_status: 'approved', quality_flag: '1' },
        { order_total: null, order_status: 'pending', quality_flag: null },
        { order_total: '102', order_status: 'approved', quality_flag: 1 },
        { order_total: 103, order_status: 'pending', quality_flag: '1' },
      ],
      samplesB: [
        { amount: 100.5, status: 'approved', confidenceFlag: true },
        { amount: 101.5, status: 'approved', confidenceFlag: true },
        { amount: null, status: 'pending', confidenceFlag: null },
        { amount: 102, status: 'approved', confidenceFlag: true },
        { amount: 103, status: 'pending', confidenceFlag: true },
      ],
    });
    expect(hasRename(report, 'quality_flag', 'confidenceFlag')).toBe(false);
  });
});

describe('Adversarial — Low-Entropy Collisions', () => {
  it('auto-accepts record_id but NOT lifecycle_status or support_comment', async () => {
    const report = await bridge.compare({
      connectorAId: 'low-entropy-a',
      connectorBId: 'low-entropy-b',
      samplesA: Array.from({ length: 20 }, (_, i) => ({
        lifecycle_status: i % 2 === 0 ? 'ACTIVE' : 'INACTIVE',
        support_comment: i % 3 === 0 ? 'N/A' : 'ACTIVE',
        record_id: `REC-${(i + 1).toString().padStart(3, '0')}`,
      })),
      samplesB: Array.from({ length: 20 }, (_, i) => ({
        state: i % 2 === 0 ? 'ACTIVE' : 'INACTIVE',
        note: i % 3 === 0 ? 'N/A' : 'ACTIVE',
        recordId: `REC-${(i + 1).toString().padStart(3, '0')}`,
      })),
    });

    expect(hasRename(report, 'record_id', 'recordId')).toBe(true);
    expect(autoAcceptedRenames(report).some(m => m.pathA === 'lifecycle_status')).toBe(false);
    expect(autoAcceptedRenames(report).some(m => m.pathA === 'support_comment')).toBe(false);
  });
});
