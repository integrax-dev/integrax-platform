/**
 * Invoice Diff
 *
 * Compares two CanonicalInvoice instances and returns detected conflicts.
 * Pure function — no I/O.
 *
 * Early returns on CURRENCY_MISMATCH and CUSTOMER_TAX_ID_MISMATCH — both make
 * subsequent comparisons meaningless (can't compare amounts cross-currency or
 * cross-taxpayer).
 */

import type { CanonicalInvoice } from './canonical.js';
import type { EntityConflict } from '../../shared/types.js';
import { makeFieldDiff } from '../../shared/entity-helpers.js';
import { normalizeCuit } from '../../shared/normalize.js';

export type InvoiceConflictType =
  | 'AMOUNT_MISMATCH'          // Total differs — BLOCK: financial integrity
  | 'CURRENCY_MISMATCH'        // Different currencies — BLOCK
  | 'CAE_MISSING'              // One side lacks CAE — ALERT: may not be authorized yet
  | 'CAE_MISMATCH'             // Both have CAE but different — BLOCK: fiscal anomaly
  | 'STATUS_MISMATCH'          // draft vs authorized vs voided — ALERT
  | 'CUSTOMER_TAX_ID_MISMATCH'; // Different taxpayers — BLOCK: wrong fiscal attribution

export interface InvoiceDiffTolerances {
  /** Maximum relative amount difference before flagging (default 0.001 = 0.1%) */
  amountPct?: number;
}

const DEFAULT_TOLERANCES: Required<InvoiceDiffTolerances> = {
  amountPct: 0.001,
};

export function diffInvoices(
  a: CanonicalInvoice,
  b: CanonicalInvoice,
  tolerances?: InvoiceDiffTolerances,
): EntityConflict<InvoiceConflictType>[] {
  const t = { ...DEFAULT_TOLERANCES, ...tolerances };
  const conflicts: EntityConflict<InvoiceConflictType>[] = [];
  const now = new Date();

  // 1. Currency — must match before comparing any amounts
  if (a.currency !== b.currency) {
    conflicts.push({
      type: 'CURRENCY_MISMATCH',
      severity: 'CRITICAL',
      systems: [a.sourceSystem, b.sourceSystem],
      entityType: 'invoice',
      diffs: [makeFieldDiff('currency', a.currency, b.currency, a.sourceSystem, b.sourceSystem)],
      summary: `Currency mismatch: ${a.sourceSystem}=${a.currency} vs ${b.sourceSystem}=${b.currency}`,
      detectedAt: now,
    });
    return conflicts; // cross-currency comparison is invalid
  }

  // 2. Customer taxId — normalize before comparing to avoid format-only false positives
  if (a.customerTaxId && b.customerTaxId) {
    const normA = normalizeCuit(a.customerTaxId);
    const normB = normalizeCuit(b.customerTaxId);
    if (normA && normB && normA !== normB) {
      conflicts.push({
        type: 'CUSTOMER_TAX_ID_MISMATCH',
        severity: 'CRITICAL',
        systems: [a.sourceSystem, b.sourceSystem],
        entityType: 'invoice',
        diffs: [makeFieldDiff('customerTaxId', a.customerTaxId, b.customerTaxId, a.sourceSystem, b.sourceSystem)],
        summary: `Customer taxId mismatch: ${a.sourceSystem}=${a.customerTaxId} vs ${b.sourceSystem}=${b.customerTaxId}`,
        detectedAt: now,
      });
      return conflicts; // comparing amounts/CAE across different taxpayers is noise
    }
  }

  // 3. CAE mismatch — both present but different: critical fiscal anomaly
  if (a.cae && b.cae && a.cae !== b.cae) {
    conflicts.push({
      type: 'CAE_MISMATCH',
      severity: 'CRITICAL',
      systems: [a.sourceSystem, b.sourceSystem],
      entityType: 'invoice',
      diffs: [makeFieldDiff('cae', a.cae, b.cae, a.sourceSystem, b.sourceSystem)],
      summary: `CAE mismatch: ${a.sourceSystem}=${a.cae} vs ${b.sourceSystem}=${b.cae}`,
      detectedAt: now,
    });
  }

  // 4. CAE missing on one side
  if (Boolean(a.cae) !== Boolean(b.cae)) {
    const missing = !a.cae ? a.sourceSystem : b.sourceSystem;
    conflicts.push({
      type: 'CAE_MISSING',
      severity: 'HIGH',
      systems: [a.sourceSystem, b.sourceSystem],
      entityType: 'invoice',
      diffs: [makeFieldDiff('cae', a.cae ?? null, b.cae ?? null, a.sourceSystem, b.sourceSystem)],
      summary: `CAE missing in ${missing} — invoice may not be authorized`,
      detectedAt: now,
    });
  }

  // 5. Amount drift
  if (a.amountTotal > 0 && b.amountTotal > 0) {
    const pct = Math.abs(a.amountTotal - b.amountTotal) / Math.max(a.amountTotal, b.amountTotal);
    if (pct > t.amountPct) {
      conflicts.push({
        type: 'AMOUNT_MISMATCH',
        severity: 'CRITICAL',
        systems: [a.sourceSystem, b.sourceSystem],
        entityType: 'invoice',
        diffs: [makeFieldDiff('amountTotal', a.amountTotal, b.amountTotal, a.sourceSystem, b.sourceSystem)],
        summary: `Amount mismatch: ${a.sourceSystem}=${a.amountTotal} vs ${b.sourceSystem}=${b.amountTotal} (${(pct * 100).toFixed(2)}% drift)`,
        detectedAt: now,
      });
    }
  }

  // 6. Status divergence
  if (a.status !== b.status) {
    conflicts.push({
      type: 'STATUS_MISMATCH',
      severity: 'HIGH',
      systems: [a.sourceSystem, b.sourceSystem],
      entityType: 'invoice',
      diffs: [makeFieldDiff('status', a.status, b.status, a.sourceSystem, b.sourceSystem)],
      summary: `Status mismatch: ${a.sourceSystem}=${a.status} vs ${b.sourceSystem}=${b.status}`,
      detectedAt: now,
    });
  }

  return conflicts;
}
