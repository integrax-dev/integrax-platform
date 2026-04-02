/**
 * Unit tests — updateMemoryEntry + createMappingMemoryOntologyProvider
 *
 * Cubren:
 *  - Creación de entrada nueva (accepted / rejected)
 *  - Actualización de contadores y media ponderada acumulada
 *  - Connector scoping (connectorAId/B)
 *  - Rejection veto (≥70% rechazos con ≥3 muestras → match devuelve null)
 *  - Path-level vs leaf-level matching
 *  - SchemaBridge.recordFeedback() + getMemorySnapshot()
 */
import { describe, it, expect } from 'vitest';
import {
  updateMemoryEntry,
  createMappingMemoryOntologyProvider,
} from '../../src/mapping-memory-provider.js';
import { SchemaBridge } from '../../src/bridge.js';
import type { MappingMemoryEntry } from '../../src/types.js';

// ─── updateMemoryEntry ────────────────────────────────────────────────────────

describe('updateMemoryEntry — new entry', () => {
  it('creates accepted entry with count=1', () => {
    const result = updateMemoryEntry([], 'amount', 'total', true, 0.90);
    expect(result).toHaveLength(1);
    expect(result[0].acceptedCount).toBe(1);
    expect(result[0].rejectedCount).toBe(0);
    expect(result[0].averageConfidence).toBe(0.90);
    expect(result[0].lastAcceptedAt).toBeDefined();
  });

  it('creates rejected entry with count=1, no lastAcceptedAt', () => {
    const result = updateMemoryEntry([], 'amount', 'total', false, 0.55);
    expect(result[0].acceptedCount).toBe(0);
    expect(result[0].rejectedCount).toBe(1);
    expect(result[0].averageConfidence).toBe(0.55);
    expect(result[0].lastAcceptedAt).toBeUndefined();
  });

  it('scopes new entry to connector pair', () => {
    const result = updateMemoryEntry([], 'id', 'payment_id', true, 0.95, 'mp', 'billing');
    expect(result[0].connectorAId).toBe('mp');
    expect(result[0].connectorBId).toBe('billing');
  });
});

describe('updateMemoryEntry — update existing', () => {
  it('increments acceptedCount', () => {
    const base = updateMemoryEntry([], 'amount', 'total', true, 0.90);
    const result = updateMemoryEntry(base, 'amount', 'total', true, 0.92);
    expect(result).toHaveLength(1);
    expect(result[0].acceptedCount).toBe(2);
    expect(result[0].rejectedCount).toBe(0);
  });

  it('increments rejectedCount', () => {
    const base = updateMemoryEntry([], 'amount', 'total', true, 0.90);
    const result = updateMemoryEntry(base, 'amount', 'total', false, 0.50);
    expect(result[0].acceptedCount).toBe(1);
    expect(result[0].rejectedCount).toBe(1);
  });

  it('computes proper weighted rolling average — not simple mean', () => {
    // 10 acepciones anteriores con avg=0.90; nueva muestra con confidence=0.50.
    // Media ponderada correcta: (0.90 * 10 + 0.50) / 11 ≈ 0.8545
    // Media simple incorrecta: (0.90 + 0.50) / 2 = 0.70
    let entries: MappingMemoryEntry[] = [
      {
        sourcePath: 'amount',
        targetPath: 'total',
        acceptedCount: 10,
        rejectedCount: 0,
        averageConfidence: 0.90,
      },
    ];
    entries = updateMemoryEntry(entries, 'amount', 'total', true, 0.50);
    expect(entries[0].averageConfidence).toBeCloseTo((0.90 * 10 + 0.50) / 11, 5);
  });

  it('does not update lastAcceptedAt on rejection', () => {
    const ts = '2024-01-01T00:00:00.000Z';
    const base: MappingMemoryEntry[] = [{
      sourcePath: 'amount',
      targetPath: 'total',
      acceptedCount: 1,
      rejectedCount: 0,
      averageConfidence: 0.90,
      lastAcceptedAt: ts,
    }];
    const result = updateMemoryEntry(base, 'amount', 'total', false, 0.40);
    expect(result[0].lastAcceptedAt).toBe(ts);
  });

  it('does not modify original array (immutable)', () => {
    const original = updateMemoryEntry([], 'amount', 'total', true, 0.90);
    const snap = JSON.stringify(original);
    updateMemoryEntry(original, 'amount', 'total', true, 0.90);
    expect(JSON.stringify(original)).toBe(snap);
  });
});

describe('updateMemoryEntry — connector scoping', () => {
  it('treats same path with different connectors as separate entries', () => {
    let entries: MappingMemoryEntry[] = [];
    entries = updateMemoryEntry(entries, 'amount', 'total', true, 0.90, 'mp', 'billing');
    entries = updateMemoryEntry(entries, 'amount', 'total', true, 0.80);          // global
    entries = updateMemoryEntry(entries, 'amount', 'total', true, 0.70, 'other', 'b');
    expect(entries).toHaveLength(3);
  });

  it('updates only the matching scoped entry', () => {
    let entries: MappingMemoryEntry[] = [];
    entries = updateMemoryEntry(entries, 'amount', 'total', true, 0.90, 'mp', 'billing');
    entries = updateMemoryEntry(entries, 'amount', 'total', true, 0.80);
    // Segunda aceptación solo para 'mp'+'billing'
    entries = updateMemoryEntry(entries, 'amount', 'total', true, 0.92, 'mp', 'billing');
    const mpEntry = entries.find(e => e.connectorAId === 'mp');
    const globalEntry = entries.find(e => !e.connectorAId);
    expect(mpEntry!.acceptedCount).toBe(2);
    expect(globalEntry!.acceptedCount).toBe(1);
  });
});

// ─── createMappingMemoryOntologyProvider ─────────────────────────────────────

describe('createMappingMemoryOntologyProvider — basic matching', () => {
  it('returns score for exact path match', () => {
    const provider = createMappingMemoryOntologyProvider([{
      sourcePath: 'amount',
      targetPath: 'total',
      acceptedCount: 5,
      rejectedCount: 0,
      averageConfidence: 0.90,
    }]);
    const match = provider.match({ pathA: 'amount', pathB: 'total', nodeA: null, nodeB: null });
    expect(match).not.toBeNull();
    expect(match!.score).toBeGreaterThanOrEqual(0.55);
    expect(match!.label).toBe('mapping_memory_path');
  });

  it('returns null for unknown pair', () => {
    const provider = createMappingMemoryOntologyProvider([{
      sourcePath: 'amount',
      targetPath: 'total',
      acceptedCount: 5,
      rejectedCount: 0,
      averageConfidence: 0.90,
    }]);
    const match = provider.match({ pathA: 'amount', pathB: 'price', nodeA: null, nodeB: null });
    expect(match).toBeNull();
  });

  it('matches by leaf when full paths differ but leaves match', () => {
    const provider = createMappingMemoryOntologyProvider([{
      sourcePath: 'order.amount',
      targetPath: 'invoice.total',
      acceptedCount: 3,
      rejectedCount: 0,
      averageConfidence: 0.85,
    }]);
    // Diferentes prefijos, mismos leaves
    const match = provider.match({ pathA: 'payment.amount', pathB: 'billing.total', nodeA: null, nodeB: null });
    expect(match).not.toBeNull();
    expect(match!.label).toBe('mapping_memory_leaf');
  });

  it('normalizes path case: NETWR matches netwr', () => {
    const provider = createMappingMemoryOntologyProvider([{
      sourcePath: 'line_amount',
      targetPath: 'NETWR',
      acceptedCount: 4,
      rejectedCount: 0,
      averageConfidence: 0.88,
    }]);
    const match = provider.match({ pathA: 'line_amount', pathB: 'NETWR', nodeA: null, nodeB: null });
    expect(match).not.toBeNull();
  });
});

describe('createMappingMemoryOntologyProvider — rejection veto', () => {
  it('returns null for heavily-rejected pair (≥70% rejects, ≥3 samples)', () => {
    const provider = createMappingMemoryOntologyProvider([{
      sourcePath: 'amount',
      targetPath: 'code',
      acceptedCount: 1,
      rejectedCount: 9,  // 90% rechazo
      averageConfidence: 0.50,
    }]);
    const match = provider.match({ pathA: 'amount', pathB: 'code', nodeA: null, nodeB: null });
    expect(match).toBeNull();
  });

  it('does NOT veto with <3 total samples even if all rejected', () => {
    const provider = createMappingMemoryOntologyProvider([{
      sourcePath: 'amount',
      targetPath: 'code',
      acceptedCount: 0,
      rejectedCount: 2,  // 100% rechazo pero solo 2 muestras
      averageConfidence: 0.40,
    }]);
    const match = provider.match({ pathA: 'amount', pathB: 'code', nodeA: null, nodeB: null });
    // No vetoed — 2 < REJECTION_MIN_SAMPLES(3)
    expect(match).not.toBeNull();
  });

  it('does NOT veto at exactly 69% rejection rate', () => {
    const provider = createMappingMemoryOntologyProvider([{
      sourcePath: 'amount',
      targetPath: 'code',
      acceptedCount: 31,
      rejectedCount: 69,  // 69% — por debajo del umbral 70%
      averageConfidence: 0.55,
    }]);
    const match = provider.match({ pathA: 'amount', pathB: 'code', nodeA: null, nodeB: null });
    expect(match).not.toBeNull();
  });

  it('vetoes leaf match too when leaf entry is rejected', () => {
    const provider = createMappingMemoryOntologyProvider([{
      sourcePath: 'order.amount',
      targetPath: 'invoice.code',
      acceptedCount: 0,
      rejectedCount: 5,
      averageConfidence: 0.40,
    }]);
    const match = provider.match({ pathA: 'payment.amount', pathB: 'billing.code', nodeA: null, nodeB: null });
    expect(match).toBeNull();
  });
});

// ─── SchemaBridge feedback API ────────────────────────────────────────────────

describe('SchemaBridge.recordFeedback() + getMemorySnapshot()', () => {
  it('snapshot is empty on fresh instance', () => {
    const bridge = new SchemaBridge({ autoAcceptThreshold: 0.88, humanReviewThreshold: 0.70, decisionPolicy: { autoAcceptThreshold: 0.88, reviewThreshold: 0.70 } });
    expect(bridge.getMemorySnapshot()).toHaveLength(0);
  });

  it('snapshot preserves initial memory from config', () => {
    const initial: MappingMemoryEntry[] = [{
      sourcePath: 'amount',
      targetPath: 'total',
      acceptedCount: 3,
      rejectedCount: 0,
      averageConfidence: 0.88,
    }];
    const bridge = new SchemaBridge({ mappingMemory: initial });
    expect(bridge.getMemorySnapshot()).toHaveLength(1);
    expect(bridge.getMemorySnapshot()[0].sourcePath).toBe('amount');
  });

  it('recordFeedback creates a new entry', () => {
    const bridge = new SchemaBridge({ autoAcceptThreshold: 0.88, humanReviewThreshold: 0.70, decisionPolicy: { autoAcceptThreshold: 0.88, reviewThreshold: 0.70 } });
    bridge.recordFeedback('monto', 'amount', true, 0.92);
    const snap = bridge.getMemorySnapshot();
    expect(snap).toHaveLength(1);
    expect(snap[0].acceptedCount).toBe(1);
    expect(snap[0].rejectedCount).toBe(0);
  });

  it('recordFeedback accumulates multiple feedbacks on same pair', () => {
    const bridge = new SchemaBridge({ autoAcceptThreshold: 0.88, humanReviewThreshold: 0.70, decisionPolicy: { autoAcceptThreshold: 0.88, reviewThreshold: 0.70 } });
    bridge.recordFeedback('monto', 'amount', true, 0.90);
    bridge.recordFeedback('monto', 'amount', true, 0.92);
    bridge.recordFeedback('monto', 'amount', false, 0.40);
    const snap = bridge.getMemorySnapshot();
    expect(snap[0].acceptedCount).toBe(2);
    expect(snap[0].rejectedCount).toBe(1);
  });

  it('getMemorySnapshot returns a copy — mutations do not affect internal state', () => {
    const bridge = new SchemaBridge({ autoAcceptThreshold: 0.88, humanReviewThreshold: 0.70, decisionPolicy: { autoAcceptThreshold: 0.88, reviewThreshold: 0.70 } });
    bridge.recordFeedback('x', 'y', true, 0.80);
    const snap = bridge.getMemorySnapshot();
    snap.push({ sourcePath: 'injected', targetPath: 'evil', acceptedCount: 0, rejectedCount: 0, averageConfidence: 0 });
    expect(bridge.getMemorySnapshot()).toHaveLength(1);
  });

  it('snapshot from one instance seeds a new instance correctly', async () => {
    // Simula el ciclo persist → reload: el feedback del operador afecta la siguiente corrida.
    const bridge1 = new SchemaBridge({ autoAcceptThreshold: 0.88, humanReviewThreshold: 0.70, decisionPolicy: { autoAcceptThreshold: 0.88, reviewThreshold: 0.70 } });
    bridge1.recordFeedback('nro_cliente', 'customer_id', true, 0.95);
    const snapshot = bridge1.getMemorySnapshot();

    const bridge2 = new SchemaBridge({ mappingMemory: snapshot, autoAcceptThreshold: 0.88, humanReviewThreshold: 0.70, decisionPolicy: { autoAcceptThreshold: 0.88, reviewThreshold: 0.70 } });
    const report = await bridge2.compare({
      connectorAId: 'erp',
      connectorBId: 'crm',
      samplesA: [
        { nro_cliente: 'C-001', nro_factura: 'F-001' },
        { nro_cliente: 'C-002', nro_factura: 'F-002' },
        { nro_cliente: 'C-003', nro_factura: 'F-003' },
      ],
      samplesB: [
        { customer_id: 'C-001', invoice_ref: 'F-001' },
        { customer_id: 'C-002', invoice_ref: 'F-002' },
        { customer_id: 'C-003', invoice_ref: 'F-003' },
      ],
    });

    // La memoria eleva el score de nro_cliente ↔ customer_id
    const mapping = report.mappings.find(m => m.pathA === 'nro_cliente' && m.pathB === 'customer_id');
    expect(mapping).toBeDefined();
  });
});
