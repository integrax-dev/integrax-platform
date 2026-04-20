import { describe, it, expect } from 'vitest';
import { compareEntities, detectMismatch, detectDrift, detectDuplicates } from './diff/compare.js';
import { IdentityResolver } from './identity/resolver.js';
import type { Snapshot } from './diff/types.js';

// ─── detectMismatch ───────────────────────────────────────────────────────────

describe('detectMismatch', () => {
  it('retorna false para valores iguales', () => {
    expect(detectMismatch('abc', 'abc')).toBe(false);
    expect(detectMismatch(42, 42)).toBe(false);
  });

  it('retorna true para strings distintos', () => {
    expect(detectMismatch('a', 'b')).toBe(true);
  });

  it('compara números con tolerancia fraccionaria', () => {
    expect(detectMismatch(100, 100.5, 0.01)).toBe(false); // 0.5% diff < 1%
    expect(detectMismatch(100, 120, 0.10)).toBe(true);    // 20% > 10%
  });

  it('compara fechas por timestamp', () => {
    const d1 = new Date('2025-01-01');
    const d2 = new Date('2025-01-01');
    const d3 = new Date('2025-01-02');
    expect(detectMismatch(d1, d2)).toBe(false);
    expect(detectMismatch(d1, d3)).toBe(true);
  });
});

// ─── compareEntities ─────────────────────────────────────────────────────────

describe('compareEntities', () => {
  it('devuelve sin conflictos si son idénticos', () => {
    const r = compareEntities({ price: 100, status: 'active' }, { price: 100, status: 'active' });
    expect(r.hasConflicts).toBe(false);
    expect(r.worstSeverity).toBeNull();
  });

  it('detecta soft_drift en modo sin reglas', () => {
    const r = compareEntities({ price: 100 }, { price: 200 });
    expect(r.hasConflicts).toBe(true);
    expect(r.conflicts[0].category).toBe('soft_drift');
    expect(r.conflicts[0].field).toBe('price');
  });

  it('usa reglas cuando se pasan', () => {
    const r = compareEntities(
      { stock: 100 },
      { stock: 80 },
      [{ field: 'stock', category: 'hard_drift', severity: 'HIGH' }],
    );
    expect(r.conflicts[0].category).toBe('hard_drift');
    expect(r.conflicts[0].severity).toBe('HIGH');
  });

  it('ignora campos marcados con ignore:true', () => {
    const r = compareEntities(
      { price: 100, internal: 'x' },
      { price: 100, internal: 'y' },
      [{ field: 'internal', ignore: true }],
    );
    expect(r.hasConflicts).toBe(false);
  });

  it('escala severidad para diferencias numéricas grandes', () => {
    // 100 vs 500 → 80% diff > 20% threshold → CRITICAL
    const r = compareEntities(
      { amount: 100 },
      { amount: 500 },
      [{ field: 'amount', category: 'hard_drift' }],
    );
    expect(r.worstSeverity).toBe('CRITICAL');
  });

  it('informa worstSeverity correctamente', () => {
    const r = compareEntities(
      { a: 1, b: 2 },
      { a: 2, b: 100 },
      [
        { field: 'a', severity: 'LOW' },
        { field: 'b', severity: 'CRITICAL' },
      ],
    );
    expect(r.worstSeverity).toBe('CRITICAL');
  });
});

// ─── detectDrift ─────────────────────────────────────────────────────────────

describe('detectDrift', () => {
  it('retorna sin conflictos si no hay snapshots', () => {
    const r = detectDrift([], { price: 100 });
    expect(r.hasConflicts).toBe(false);
  });

  it('compara contra el snapshot más reciente', () => {
    const snapshots: Snapshot[] = [
      { payload: { price: 100 }, capturedAt: new Date('2025-01-01') },
      { payload: { price: 90 },  capturedAt: new Date('2025-06-01') }, // más reciente
    ];
    // current coincide con el más reciente (90), no con el viejo (100)
    const r = detectDrift(snapshots, { price: 90 });
    expect(r.hasConflicts).toBe(false);
  });

  it('detecta drift respecto al snapshot más reciente', () => {
    const snapshots: Snapshot[] = [
      { payload: { price: 90 }, capturedAt: new Date('2025-06-01') },
    ];
    const r = detectDrift(snapshots, { price: 200 });
    expect(r.hasConflicts).toBe(true);
  });
});

// ─── detectDuplicates ────────────────────────────────────────────────────────

describe('detectDuplicates', () => {
  it('agrupa entidades con el mismo sku', () => {
    const groups = detectDuplicates([
      { sku: 'ABC-1', name: 'Product A' },
      { sku: 'ABC-1', name: 'Product A (copy)' },
      { sku: 'XYZ-9', name: 'Other' },
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].entities).toHaveLength(2);
  });

  it('no reporta duplicados si todos son distintos', () => {
    const groups = detectDuplicates([
      { sku: 'A' },
      { sku: 'B' },
      { sku: 'C' },
    ]);
    expect(groups).toHaveLength(0);
  });

  it('no reporta el mismo par duplicado dos veces', () => {
    // Comparten tanto id como sku → debería aparecer solo una vez
    const groups = detectDuplicates([
      { id: '1', sku: 'ABC' },
      { id: '1', sku: 'ABC' },
    ]);
    expect(groups).toHaveLength(1);
  });

  it('detecta duplicados por taxId', () => {
    const groups = detectDuplicates([
      { taxId: '20-12345678-9' },
      { taxId: '20-12345678-9' },
    ]);
    expect(groups[0].reason).toBe('shared_taxId');
  });
});

// ─── IdentityResolver ────────────────────────────────────────────────────────

describe('IdentityResolver', () => {
  it('resuelve por coincidencia exacta de externalId', () => {
    const resolver = new IdentityResolver();
    resolver.registerAlias('canon-1', 'mercadopago', 'mp-order-42');

    const result = resolver.resolve([{ system: 'mercadopago', id: 'mp-order-42' }]);
    expect(result).not.toBeNull();
    expect(result!.canonicalId).toBe('canon-1');
    expect(result!.strategy).toBe('exact');
    expect(result!.candidates[0].confidence).toBe(1.0);
  });

  it('devuelve null cuando no hay coincidencia', () => {
    const resolver = new IdentityResolver();
    const result = resolver.resolve([]);
    expect(result).toBeNull();
  });

  it('resolveOrCreate genera canonicalId cuando no hay match', () => {
    const resolver = new IdentityResolver();
    let counter = 0;
    const result = resolver.resolveOrCreate([], () => `gen-${++counter}`);
    expect(result.canonicalId).toBe('gen-1');
  });

  it('registerAlias sobreescribe index del externalId', () => {
    const resolver = new IdentityResolver();
    resolver.registerAlias('canon-A', 'sys', 'ext-1');
    resolver.registerAlias('canon-B', 'sys', 'ext-1');
    const result = resolver.resolve([{ system: 'sys', id: 'ext-1' }]);
    expect(result!.canonicalId).toBe('canon-B');
  });

  it('devuelve null cuando no hay exact ni fuzzy match', () => {
    const resolver = new IdentityResolver();
    resolver.registerAlias('canon-1', 'sys', 'order-100');
    const result = resolver.resolve([{ system: 'sys', id: 'order-9999' }]);
    // El index solo mapea 'sys:order-100', no 'sys:order-9999'
    expect(result).toBeNull();
  });
});
