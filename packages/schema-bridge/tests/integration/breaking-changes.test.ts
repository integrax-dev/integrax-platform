/**
 * Integration tests — Breaking Change Detection
 *
 * El motor debe detectar cambios que rompen integraciones existentes ANTES
 * de que lleguen a producción. Estos tests verifican que el score de breaking
 * sea correcto en escenarios reales de evolución de schemas.
 *
 * Nota: los diffs de enum (constraint_changed) solo se activan si el schema
 * tiene `enum` pre-poblado. Los tests unitarios de SchemaDiffer cubren esa
 * lógica en aislamiento. Aquí probamos field_removed, type_changed y la
 * detección vía el reporte agregado.
 */
import { describe, it, expect } from 'vitest';
import { SchemaBridge } from '../../src/bridge.js';

const bridge = new SchemaBridge({ autoAcceptThreshold: 0.88, humanReviewThreshold: 0.70, decisionPolicy: { autoAcceptThreshold: 0.88, reviewThreshold: 0.70 } });

// ─── Field Removal ────────────────────────────────────────────────────────────

describe('Breaking: field_removed', () => {
  it('detects removal of a required field with breakingScore 1.0', async () => {
    const report = await bridge.compare({
      connectorAId: 'v1',
      connectorBId: 'v2',
      samplesA: [
        { id: 'ORD-1', status: 'approved', legacy_ref: 'LR-001' },
        { id: 'ORD-2', status: 'approved', legacy_ref: 'LR-002' },
        { id: 'ORD-3', status: 'pending',  legacy_ref: 'LR-003' },
      ],
      samplesB: [
        { id: 'ORD-1', status: 'approved' },
        { id: 'ORD-2', status: 'approved' },
        { id: 'ORD-3', status: 'pending' },
      ],
    });

    const removed = report.diffs.find(d => d.kind === 'field_removed' && d.pathA === 'legacy_ref');
    expect(removed).toBeDefined();
    expect(removed!.breakingScore).toBe(1.0);
    expect(report.requirementsReport.summary.breakingCount).toBeGreaterThan(0);
  });

  it('reports multiple removed fields correctly', async () => {
    const report = await bridge.compare({
      connectorAId: 'v1',
      connectorBId: 'v2',
      samplesA: [
        { id: 'P-1', sku: 'SKU-100', legacy_code: 'LG-001', internal_ref: 'INT-001' },
        { id: 'P-2', sku: 'SKU-200', legacy_code: 'LG-002', internal_ref: 'INT-002' },
        { id: 'P-3', sku: 'SKU-300', legacy_code: 'LG-003', internal_ref: 'INT-003' },
      ],
      samplesB: [
        { id: 'P-1', sku: 'SKU-100' },
        { id: 'P-2', sku: 'SKU-200' },
        { id: 'P-3', sku: 'SKU-300' },
      ],
    });

    const removed = report.diffs.filter(d => d.kind === 'field_removed');
    expect(removed).toHaveLength(2);
    expect(removed.every(d => d.breakingScore === 1.0)).toBe(true);
  });

  it('does NOT flag field_added as breaking (score 0.0)', async () => {
    const report = await bridge.compare({
      connectorAId: 'v1',
      connectorBId: 'v2',
      samplesA: [{ id: 'ORD-1', status: 'approved' }],
      samplesB: [{ id: 'ORD-1', status: 'approved', new_field: 'extra' }],
    });

    const added = report.diffs.find(d => d.kind === 'field_added');
    expect(added).toBeDefined();
    expect(added!.breakingScore).toBe(0.0);
  });
});

// ─── Type Changes ─────────────────────────────────────────────────────────────

describe('Breaking: type_changed', () => {
  it('string → number is coercible (0.3) — can break at runtime', async () => {
    // A consumer sending "invalid" as the amount will get NaN on the other side.
    // This is coercible (not always breaking) but requiresValidation=true.
    const report = await bridge.compare({
      connectorAId: 'v1',
      connectorBId: 'v2',
      samplesA: [
        { amount: '1500.50', currency: 'ARS' },
        { amount: '2000.00', currency: 'ARS' },
        { amount: '750.25', currency: 'USD' },
      ],
      samplesB: [
        { amount: 1500.50, currency: 'ARS' },
        { amount: 2000.00, currency: 'ARS' },
        { amount: 750.25, currency: 'USD' },
      ],
    });

    const typeChange = report.diffs.find(d => d.kind === 'type_changed' && d.pathA === 'amount');
    expect(typeChange).toBeDefined();
    // coercible = 0.3 (can fail if string is non-numeric)
    expect(typeChange!.breakingScore).toBeGreaterThanOrEqual(0.3);
  });

  it('string field replaced by nested object — reports field_removed (breaking)', async () => {
    // When a flat string field (address) is replaced by an object (address.street, address.city),
    // the SchemaInferrer produces leaf paths. 'address' (string) is removed — breaking.
    // The new leaf fields address.street / address.city are added — non-breaking.
    const report = await bridge.compare({
      connectorAId: 'v1',
      connectorBId: 'v2',
      samplesA: [
        { address: 'Av. Corrientes 1234, Buenos Aires' },
        { address: 'Calle Florida 800, Buenos Aires' },
        { address: 'Av. Santa Fe 1500, Buenos Aires' },
      ],
      samplesB: [
        { address: { street: 'Av. Corrientes 1234', city: 'Buenos Aires' } },
        { address: { street: 'Calle Florida 800', city: 'Buenos Aires' } },
        { address: { street: 'Av. Santa Fe 1500', city: 'Buenos Aires' } },
      ],
    });

    // The flat 'address' string is gone — must be detected as removed (score 1.0)
    const removed = report.diffs.find(d => d.kind === 'field_removed' && d.pathA === 'address');
    expect(removed).toBeDefined();
    expect(removed!.breakingScore).toBe(1.0);
    expect(report.requirementsReport.summary.breakingCount).toBeGreaterThan(0);

    // The nested leaf fields are new additions — non-breaking
    const added = report.diffs.filter(d => d.kind === 'field_added');
    expect(added.length).toBeGreaterThan(0);
    expect(added.every(d => d.breakingScore === 0.0)).toBe(true);
  });
});

// ─── Identical Schemas ────────────────────────────────────────────────────────

describe('Identical schemas — zero diffs', () => {
  it('reports no diffs and no breaking changes when schemas are identical', async () => {
    const samples = [
      { id: 'ORD-1', status: 'approved', amount: 1500 },
      { id: 'ORD-2', status: 'pending',  amount: 800 },
      { id: 'ORD-3', status: 'approved', amount: 2200 },
    ];
    const report = await bridge.compare({
      connectorAId: 'same-v1',
      connectorBId: 'same-v2',
      samplesA: samples,
      samplesB: samples,
    });

    expect(report.diffs).toHaveLength(0);
    expect(report.requirementsReport.summary.breakingCount).toBe(0);
  });
});

// ─── Schema Evolution — Real-World Upgrade Scenarios ─────────────────────────

describe('Breaking: schema evolution — real API upgrade', () => {
  it('Stripe-like upgrade: nested field removed, new nested field added', async () => {
    const report = await bridge.compare({
      connectorAId: 'stripe-v1',
      connectorBId: 'stripe-v2',
      samplesA: [
        { id: 'ch_001', amount: 2000, currency: 'usd', card: { fingerprint: 'abc123', brand: 'visa' } },
        { id: 'ch_002', amount: 5000, currency: 'eur', card: { fingerprint: 'def456', brand: 'mastercard' } },
        { id: 'ch_003', amount: 1500, currency: 'usd', card: { fingerprint: 'ghi789', brand: 'visa' } },
      ],
      samplesB: [
        { id: 'ch_001', amount: 2000, currency: 'usd', billing_details: { name: 'John Doe' } },
        { id: 'ch_002', amount: 5000, currency: 'eur', billing_details: { name: 'Ana Costa' } },
        { id: 'ch_003', amount: 1500, currency: 'usd', billing_details: { name: 'Bruno Dias' } },
      ],
    });

    // card.fingerprint and card.brand were removed — breaking
    const removed = report.diffs.filter(d => d.kind === 'field_removed');
    expect(removed.length).toBeGreaterThan(0);
    expect(report.requirementsReport.summary.breakingCount).toBeGreaterThan(0);

    // billing_details added — non-breaking
    const added = report.diffs.filter(d => d.kind === 'field_added');
    expect(added.length).toBeGreaterThan(0);
  });

  it('breaking diffs sort before non-breaking in report.diffs', async () => {
    const report = await bridge.compare({
      connectorAId: 'v1',
      connectorBId: 'v2',
      samplesA: [
        { id: 'R-1', name: 'Alpha', removed_field: 'x' },
        { id: 'R-2', name: 'Beta',  removed_field: 'y' },
        { id: 'R-3', name: 'Gamma', removed_field: 'z' },
      ],
      samplesB: [
        { id: 'R-1', name: 'Alpha', new_field: 'added' },
        { id: 'R-2', name: 'Beta',  new_field: 'added' },
        { id: 'R-3', name: 'Gamma', new_field: 'added' },
      ],
    });

    // diffs are sorted by breakingScore descending
    for (let i = 1; i < report.diffs.length; i++) {
      expect(report.diffs[i].breakingScore).toBeLessThanOrEqual(report.diffs[i - 1].breakingScore);
    }

    // First diff should be the removal (score 1.0)
    expect(report.diffs[0].breakingScore).toBe(1.0);
  });
});
