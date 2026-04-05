/**
 * Invoice Policy
 *
 * CRITICAL conflicts (CAE, amount, customer, currency) all → BLOCK.
 * Invoices are fiscal documents — any financial discrepancy must halt sync.
 * STATUS_MISMATCH → ALERT: may indicate pending authorization.
 */

import type { PolicyAction, PolicyEvaluationResult, EntityConflict } from '../../shared/types.js';
import { aggregateAction } from '../../shared/types.js';
import type { InvoiceConflictType } from './diff.js';

export type InvoicePolicyRule = {
  conflictType: InvoiceConflictType;
  action: PolicyAction;
  reason: string;
};

export const DEFAULT_INVOICE_POLICY: InvoicePolicyRule[] = [
  { conflictType: 'AMOUNT_MISMATCH',          action: 'BLOCK',  reason: 'Amount divergence in a fiscal document must halt sync immediately' },
  { conflictType: 'CURRENCY_MISMATCH',         action: 'BLOCK',  reason: 'Cross-currency comparison is invalid for fiscal invoices' },
  { conflictType: 'CAE_MISSING',               action: 'ALERT',  reason: 'Invoice may not be authorized yet — operator review needed' },
  { conflictType: 'CAE_MISMATCH',              action: 'BLOCK',  reason: 'Different CAEs on matched invoices is a critical fiscal anomaly' },
  { conflictType: 'CUSTOMER_TAX_ID_MISMATCH',  action: 'BLOCK',  reason: 'Invoice attributed to different taxpayers — cannot reconcile' },
  { conflictType: 'STATUS_MISMATCH',           action: 'ALERT',  reason: 'Status divergence may indicate a pending authorization step' },
];

export function evaluateInvoiceConflicts(
  conflicts: EntityConflict<InvoiceConflictType>[],
  tenantOverrides?: Partial<Record<InvoiceConflictType, PolicyAction>>,
): PolicyEvaluationResult<InvoiceConflictType>[] {
  const merged: Record<InvoiceConflictType, { action: PolicyAction; reason: string }> = {} as never;

  for (const rule of DEFAULT_INVOICE_POLICY) {
    merged[rule.conflictType] = { action: rule.action, reason: rule.reason };
  }

  for (const [type, action] of Object.entries(tenantOverrides ?? {})) {
    merged[type as InvoiceConflictType] = {
      action: action as PolicyAction,
      reason: 'tenant_override',
    };
  }

  return conflicts.map(conflict => {
    const rule = merged[conflict.type] ?? { action: 'BLOCK' as PolicyAction, reason: 'no_rule_default' };
    return { conflict, action: rule.action, reason: rule.reason };
  });
}

export function invoiceRecommendation(
  evaluated: PolicyEvaluationResult<InvoiceConflictType>[],
): PolicyAction | 'PROCEED' {
  return aggregateAction(evaluated.map(e => e.action));
}
