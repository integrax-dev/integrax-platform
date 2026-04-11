/**
 * Customer Diff
 *
 * Compares two CanonicalCustomer instances and returns detected conflicts.
 * Pure function — no I/O.
 *
 * taxId comparison normalizes both sides (strips dashes/spaces) before comparing
 * so "20-12345678-9" and "20123456789" don't trigger a false BLOCK.
 */

import type { CanonicalCustomer } from './canonical.js';
import type { EntityConflict } from '../../shared/types.js';
import { makeFieldDiff } from '../../shared/entity-helpers.js';
import { normalizeCuit } from '../../shared/normalize.js';

export type CustomerConflictType =
  | 'TAX_ID_MISMATCH'      // Different CUIT/taxId after normalization — BLOCK
  | 'VAT_STATUS_MISMATCH'  // Different CondicionIVA — BLOCK: drives invoice type (A vs B vs C)
  | 'NAME_MISMATCH'        // Different RazonSocial — ALERT
  | 'EMAIL_MISMATCH'       // Different email — IGNORE: contact info drift
  | 'STATUS_MISMATCH';     // active vs inactive — ALERT

export function diffCustomers(
  a: CanonicalCustomer,
  b: CanonicalCustomer,
): EntityConflict<CustomerConflictType>[] {
  const conflicts: EntityConflict<CustomerConflictType>[] = [];
  const now = new Date();

  // TaxId — normalize both sides before comparing to avoid format-only false positives
  // "20-12345678-9" vs "20123456789" must NOT trigger BLOCK — same CUIT, different format
  if (a.taxId && b.taxId) {
    const normA = normalizeCuit(a.taxId);
    const normB = normalizeCuit(b.taxId);
    if (normA && normB && normA !== normB) {
      conflicts.push({
        type: 'TAX_ID_MISMATCH',
        severity: 'CRITICAL',
        systems: [a.sourceSystem, b.sourceSystem],
        entityType: 'customer',
        diffs: [makeFieldDiff('taxId', a.taxId, b.taxId, a.sourceSystem, b.sourceSystem)],
        summary: `TaxId mismatch: ${a.sourceSystem}=${a.taxId} vs ${b.sourceSystem}=${b.taxId}`,
        detectedAt: now,
      });
      // Different taxpayer — all subsequent comparisons are meaningless
      return conflicts;
    }
  }

  // VAT status — drives which comprobante type AFIP accepts
  if (a.vatStatus && b.vatStatus && a.vatStatus !== b.vatStatus) {
    conflicts.push({
      type: 'VAT_STATUS_MISMATCH',
      severity: 'CRITICAL',
      systems: [a.sourceSystem, b.sourceSystem],
      entityType: 'customer',
      diffs: [makeFieldDiff('vatStatus', a.vatStatus, b.vatStatus, a.sourceSystem, b.sourceSystem)],
      summary: `VAT status mismatch: ${a.sourceSystem}=${a.vatStatus} vs ${b.sourceSystem}=${b.vatStatus}`,
      detectedAt: now,
    });
  }

  // Name divergence
  if (a.name && b.name && a.name !== b.name) {
    conflicts.push({
      type: 'NAME_MISMATCH',
      severity: 'MEDIUM',
      systems: [a.sourceSystem, b.sourceSystem],
      entityType: 'customer',
      diffs: [makeFieldDiff('name', a.name, b.name, a.sourceSystem, b.sourceSystem)],
      summary: `Name mismatch: ${a.sourceSystem}="${a.name}" vs ${b.sourceSystem}="${b.name}"`,
      detectedAt: now,
    });
  }

  // Email drift
  if (a.email && b.email && a.email.toLowerCase() !== b.email.toLowerCase()) {
    conflicts.push({
      type: 'EMAIL_MISMATCH',
      severity: 'LOW',
      systems: [a.sourceSystem, b.sourceSystem],
      entityType: 'customer',
      diffs: [makeFieldDiff('email', a.email, b.email, a.sourceSystem, b.sourceSystem)],
      summary: `Email mismatch: ${a.sourceSystem}=${a.email} vs ${b.sourceSystem}=${b.email}`,
      detectedAt: now,
    });
  }

  // Status divergence
  if (a.status !== b.status) {
    conflicts.push({
      type: 'STATUS_MISMATCH',
      severity: 'MEDIUM',
      systems: [a.sourceSystem, b.sourceSystem],
      entityType: 'customer',
      diffs: [makeFieldDiff('status', a.status, b.status, a.sourceSystem, b.sourceSystem)],
      summary: `Status mismatch: ${a.sourceSystem}=${a.status} vs ${b.sourceSystem}=${b.status}`,
      detectedAt: now,
    });
  }

  return conflicts;
}
