/**
 * Product Diff
 *
 * Compares two CanonicalProduct instances and returns detected conflicts.
 * Pure function — no I/O.
 */

import type { CanonicalProduct } from './canonical.js';
import type { EntityConflict } from '../../shared/types.js';
import { makeFieldDiff } from '../../shared/entity-helpers.js';

export type ProductConflictType =
  | 'PRICE_MISMATCH'
  | 'STOCK_MISMATCH'
  | 'STATUS_MISMATCH'
  | 'CURRENCY_MISMATCH';

export interface DiffTolerances {
  /** Maximum relative price difference before flagging (default 0.01 = 1%) */
  pricePct?: number;
  /** Maximum absolute stock delta before flagging (default 0) */
  stockAbs?: number;
}

const FALLBACK_TOLERANCES: Required<DiffTolerances> = {
  pricePct: 0.01,
  stockAbs: 0,
};

export function diffProducts(
  a: CanonicalProduct,
  b: CanonicalProduct,
  tolerances?: DiffTolerances,
): EntityConflict<ProductConflictType>[] {
  const t = { ...FALLBACK_TOLERANCES, ...tolerances };
  const conflicts: EntityConflict<ProductConflictType>[] = [];
  const now = new Date();

  // Currency must match before comparing monetary values
  if (a.currency !== b.currency) {
    conflicts.push({
      type: 'CURRENCY_MISMATCH',
      severity: 'CRITICAL',
      systems: [a.sourceSystem, b.sourceSystem],
      entityType: 'product',
      diffs: [makeFieldDiff('currency', a.currency, b.currency, a.sourceSystem, b.sourceSystem)],
      summary: `Currency mismatch: ${a.sourceSystem}=${a.currency} vs ${b.sourceSystem}=${b.currency}`,
      detectedAt: now,
    });
    return conflicts; // monetary comparisons are invalid cross-currency
  }

  // Price drift
  if (a.price > 0 && b.price > 0) {
    const pct = Math.abs(a.price - b.price) / Math.max(a.price, b.price);
    if (pct > t.pricePct) {
      conflicts.push({
        type: 'PRICE_MISMATCH',
        severity: 'HIGH',
        systems: [a.sourceSystem, b.sourceSystem],
        entityType: 'product',
        diffs: [makeFieldDiff('price', a.price, b.price, a.sourceSystem, b.sourceSystem)],
        summary: `Price mismatch: ${a.sourceSystem}=$${a.price} vs ${b.sourceSystem}=$${b.price} (${(pct * 100).toFixed(1)}% drift)`,
        detectedAt: now,
      });
    }
  }

  // Stock delta
  const stockDelta = Math.abs(a.stock - b.stock);
  if (stockDelta > t.stockAbs) {
    conflicts.push({
      type: 'STOCK_MISMATCH',
      severity: 'HIGH',
      systems: [a.sourceSystem, b.sourceSystem],
      entityType: 'product',
      diffs: [makeFieldDiff('stock', a.stock, b.stock, a.sourceSystem, b.sourceSystem)],
      summary: `Stock mismatch: ${a.sourceSystem}=${a.stock} vs ${b.sourceSystem}=${b.stock} (delta=${stockDelta})`,
      detectedAt: now,
    });
  }

  // Status divergence
  if (a.status !== b.status) {
    conflicts.push({
      type: 'STATUS_MISMATCH',
      severity: 'MEDIUM',
      systems: [a.sourceSystem, b.sourceSystem],
      entityType: 'product',
      diffs: [makeFieldDiff('status', a.status, b.status, a.sourceSystem, b.sourceSystem)],
      summary: `Status mismatch: ${a.sourceSystem}=${a.status} vs ${b.sourceSystem}=${b.status}`,
      detectedAt: now,
    });
  }

  return conflicts;
}
