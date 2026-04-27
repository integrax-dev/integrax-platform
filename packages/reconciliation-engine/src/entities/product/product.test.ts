import { describe, it, expect as _expect } from 'vitest';
const expect = _expect as any;
import { matchProduct } from './identity.js';
import { diffProducts } from './diff.js';
import { evaluateProductConflicts, productRecommendation } from './policy.js';
import type { CanonicalProduct } from './canonical.js';
import type { ManualLink } from '../../shared/entity-helpers.js';

// ─── Fixtures ──────────────────────────────────────────────────────────────────

function product(overrides: Partial<CanonicalProduct> = {}): CanonicalProduct {
  return {
    externalIds: [{ system: 'mercadopago', id: 'MP-001' }],
    sku: 'PROD-001',
    title: 'Remera Nike Talle M',
    brand: 'Nike',
    price: 5000,
    currency: 'ARS',
    stock: 10,
    status: 'active',
    updatedAt: new Date('2025-01-01'),
    sourceSystem: 'mercadopago',
    ...overrides,
  };
}

// ─── matchProduct ──────────────────────────────────────────────────────────────

describe('matchProduct', () => {
  it('manual link always wins', () => {
    const a = product({ externalIds: [{ system: 'mp', id: 'A1' }], sku: 'X' });
    const b = product({ externalIds: [{ system: 'cont', id: 'B1' }], sku: 'Y' });
    const links: ManualLink[] = [{ systemA: 'mp', externalIdA: 'A1', systemB: 'cont', externalIdB: 'B1' }];
    const result = matchProduct(a, b, links);
    expect(result.decision).toBe('match');
    expect(result.reason).toBe('manual_link');
    expect(result.confidence).toBe(1.0);
  });

  it('manual link works in reverse direction', () => {
    const a = product({ externalIds: [{ system: 'mp', id: 'A1' }] });
    const b = product({ externalIds: [{ system: 'cont', id: 'B1' }] });
    const links: ManualLink[] = [{ systemA: 'cont', externalIdA: 'B1', systemB: 'mp', externalIdB: 'A1' }];
    expect(matchProduct(a, b, links).reason).toBe('manual_link');
  });

  it('external ID overlap → match', () => {
    const a = product({ externalIds: [{ system: 'shared', id: 'SHARED-1' }] });
    const b = product({ externalIds: [{ system: 'shared', id: 'SHARED-1' }] });
    const r = matchProduct(a, b);
    expect(r.decision).toBe('match');
    expect(r.reason).toBe('external_id_exact');
  });

  it('exact SKU → match', () => {
    const a = product({ sku: 'ABC-123' });
    const b = product({ sku: 'ABC-123', externalIds: [{ system: 'other', id: 'X' }] });
    expect(matchProduct(a, b).reason).toBe('sku_exact');
  });

  it('normalized SKU strips hyphens → match', () => {
    const a = product({ sku: 'ABC-123' });
    const b = product({ sku: 'ABC123', externalIds: [{ system: 'other', id: 'X' }] });
    const r = matchProduct(a, b);
    expect(r.reason).toBe('sku_normalized');
    expect(r.confidence).toBe(0.90);
  });

  it('high title similarity → match or review', () => {
    const a = product({ sku: '', externalIds: [{ system: 'a', id: '1' }] });
    const b = product({ sku: '', externalIds: [{ system: 'b', id: '2' }], title: 'Remera Nike Talle M' });
    const r = matchProduct(a, b);
    expect(['match', 'review']).toContain(r.decision);
    expect(r.confidence).toBeGreaterThanOrEqual(0.85);
  });

  it('completely different products → no_match', () => {
    const a = product({ sku: 'A', title: 'Heladera Samsung', externalIds: [{ system: 'a', id: '1' }] });
    const b = product({ sku: 'B', title: 'Televisor LG 55', externalIds: [{ system: 'b', id: '2' }] });
    expect(matchProduct(a, b).decision).toBe('no_match');
  });
});

// ─── diffProducts ──────────────────────────────────────────────────────────────

describe('diffProducts', () => {
  it('identical products → no conflicts', () => {
    const a = product();
    const b = product({ sourceSystem: 'contabilium' });
    expect(diffProducts(a, b)).toHaveLength(0);
  });

  it('currency mismatch → CURRENCY_MISMATCH only (early return)', () => {
    const a = product({ currency: 'ARS' });
    const b = product({ currency: 'USD', sourceSystem: 'cont' });
    const conflicts = diffProducts(a, b);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].type).toBe('CURRENCY_MISMATCH');
    expect(conflicts[0].severity).toBe('CRITICAL');
  });

  it('price within 1% tolerance → no PRICE_MISMATCH', () => {
    const a = product({ price: 5000 });
    const b = product({ price: 5049, sourceSystem: 'cont' }); // 0.98% drift
    expect(diffProducts(a, b).find(c => c.type === 'PRICE_MISMATCH')).toBeUndefined();
  });

  it('price above 1% tolerance → PRICE_MISMATCH', () => {
    const a = product({ price: 5000 });
    const b = product({ price: 5100, sourceSystem: 'cont' }); // 2% drift
    expect(diffProducts(a, b).find(c => c.type === 'PRICE_MISMATCH')).toBeDefined();
  });

  it('stock delta → STOCK_MISMATCH', () => {
    const a = product({ stock: 10 });
    const b = product({ stock: 11, sourceSystem: 'cont' });
    expect(diffProducts(a, b).find(c => c.type === 'STOCK_MISMATCH')).toBeDefined();
  });

  it('same stock → no STOCK_MISMATCH', () => {
    const a = product({ stock: 5 });
    const b = product({ stock: 5, sourceSystem: 'cont' });
    expect(diffProducts(a, b)).toHaveLength(0);
  });

  it('status mismatch → STATUS_MISMATCH MEDIUM', () => {
    const a = product({ status: 'active' });
    const b = product({ status: 'inactive', sourceSystem: 'cont' });
    const c = diffProducts(a, b).find(x => x.type === 'STATUS_MISMATCH');
    expect(c).toBeDefined();
    expect(c!.severity).toBe('MEDIUM');
  });

  it('custom tolerance: 5% suppresses 2% price drift', () => {
    const a = product({ price: 5000 });
    const b = product({ price: 5100, sourceSystem: 'cont' });
    expect(diffProducts(a, b, { pricePct: 0.05 }).find(c => c.type === 'PRICE_MISMATCH')).toBeUndefined();
  });

  it('stockAbs tolerance: delta of 1 suppressed when tolerance is 2', () => {
    const a = product({ stock: 10 });
    const b = product({ stock: 11, sourceSystem: 'cont' });
    expect(diffProducts(a, b, { stockAbs: 2 }).find(c => c.type === 'STOCK_MISMATCH')).toBeUndefined();
  });
});

// ─── policy ────────────────────────────────────────────────────────────────────

describe('evaluateProductConflicts + productRecommendation', () => {
  it('no conflicts → PROCEED', () => {
    expect(productRecommendation(evaluateProductConflicts([]))).toBe('PROCEED');
  });

  it('CURRENCY_MISMATCH → BLOCK', () => {
    const conflicts = diffProducts(
      product({ currency: 'ARS' }),
      product({ currency: 'USD', sourceSystem: 'cont' }),
    );
    expect(productRecommendation(evaluateProductConflicts(conflicts))).toBe('BLOCK');
  });

  it('STOCK_MISMATCH → ALERT', () => {
    const conflicts = diffProducts(
      product({ stock: 5 }),
      product({ stock: 6, sourceSystem: 'cont' }),
    );
    expect(productRecommendation(evaluateProductConflicts(conflicts))).toBe('ALERT');
  });

  it('STATUS_MISMATCH only (IGNORE) → PROCEED', () => {
    const conflicts = diffProducts(
      product({ status: 'active' }),
      product({ status: 'inactive', sourceSystem: 'cont' }),
    );
    // IGNORE ranks same as PROCEED — aggregation should return PROCEED
    expect(productRecommendation(evaluateProductConflicts(conflicts))).toBe('PROCEED');
  });

  it('tenant override: STOCK_MISMATCH → BLOCK', () => {
    const conflicts = diffProducts(
      product({ stock: 5 }),
      product({ stock: 6, sourceSystem: 'cont' }),
    );
    expect(productRecommendation(evaluateProductConflicts(conflicts, undefined, { STOCK_MISMATCH: 'BLOCK' }))).toBe('BLOCK');
  });

  it('each evaluated result carries the correct action', () => {
    const conflicts = diffProducts(
      product({ stock: 5, price: 5000 }),
      product({ stock: 6, price: 5200, sourceSystem: 'cont' }),
    );
    const evaluated = evaluateProductConflicts(conflicts);
    const stockResult = evaluated.find(e => e.conflict.type === 'STOCK_MISMATCH');
    const priceResult = evaluated.find(e => e.conflict.type === 'PRICE_MISMATCH');
    expect(stockResult?.action).toBe('ALERT');
    expect(priceResult?.action).toBe('ALERT');
  });
});
