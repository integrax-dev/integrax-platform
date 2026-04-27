/**
 * Invoice Identity Matching
 *
 * Matching priority (first confident match wins):
 *   1. Manual link  (entity_links — passed as manualLinks)
 *   2. Exact external ID overlap
 *   3. Authorization code exact match (globally unique per authorized invoice)
 *   4. invoiceNumber + invoiceType + customerTaxId (composite natural key)
 *   5. invoiceNumber + customerTaxId (no type check — → review)
 *   6. amountTotal + customerTaxId + same issuedAt day (weak fingerprint — → review)
 */

import type { CanonicalInvoice } from './canonical.js';
import type { MatchResult } from '../../shared/types.js';
import type { ManualLink } from '../../shared/entity-helpers.js';
import { hasManualLink, findExternalIdOverlap } from '../../shared/entity-helpers.js';
import { normalizeTaxId } from '../../shared/normalize.js';

export type { ManualLink };

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function matchInvoice(
  a: CanonicalInvoice,
  b: CanonicalInvoice,
  manualLinks: ManualLink[] = [],
): MatchResult {
  // 1. Manual link
  if (hasManualLink(a.externalIds, b.externalIds, manualLinks)) {
    return { decision: 'match', confidence: 1.0, reason: 'manual_link' };
  }

  // 2. External ID overlap
  if (findExternalIdOverlap(a.externalIds, b.externalIds)) {
    return { decision: 'match', confidence: 0.99, reason: 'external_id_exact' };
  }

  // 3. Authorization code — globally unique per authorized invoice
  if (a.authorizationCode && b.authorizationCode && a.authorizationCode === b.authorizationCode) {
    return { decision: 'match', confidence: 0.99, reason: 'authorization_code_exact' };
  }

  // Normalize taxIds for composite key comparisons
  const taxIdA = a.customerTaxId ? normalizeTaxId(a.customerTaxId) : '';
  const taxIdB = b.customerTaxId ? normalizeTaxId(b.customerTaxId) : '';
  const taxIdsMatch = taxIdA && taxIdB && taxIdA === taxIdB;

  // 4. invoiceNumber + invoiceType + customerTaxId
  if (
    a.invoiceNumber &&
    b.invoiceNumber &&
    a.invoiceNumber === b.invoiceNumber &&
    String(a.invoiceType) === String(b.invoiceType) &&
    taxIdsMatch
  ) {
    return { decision: 'match', confidence: 0.97, reason: 'invoice_number_type_customer' };
  }

  // 5. invoiceNumber + customerTaxId (no type check)
  if (a.invoiceNumber && b.invoiceNumber && a.invoiceNumber === b.invoiceNumber && taxIdsMatch) {
    return { decision: 'review', confidence: 0.85, reason: 'invoice_number_customer' };
  }

  // 6. Amount + customerTaxId + same day — weak fingerprint
  if (
    a.amountTotal === b.amountTotal &&
    a.currency === b.currency &&
    taxIdsMatch &&
    sameDay(a.issuedAt, b.issuedAt)
  ) {
    return { decision: 'review', confidence: 0.65, reason: 'amount_customer_date_fingerprint' };
  }

  return { decision: 'no_match', confidence: 0, reason: 'no_signal' };
}
