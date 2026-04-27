/**
 * Invoice Policy
 *
 * CRITICAL conflicts (authorization code, amount, customer, currency) all → BLOCK.
 * Invoices are fiscal documents — any financial discrepancy must halt sync.
 * STATUS_MISMATCH → ALERT: may indicate pending authorization.
 */

import type { PolicyAction, PolicyEvaluationResult, EntityConflict } from '../../shared/types.js';
import { aggregateAction } from '../../shared/types.js';
import type { InvoiceConflictType } from './diff.js';
import type { PolicyRule } from '../../config/types.js';

export type InvoicePolicyRule = PolicyRule<InvoiceConflictType>;

export function evaluateInvoiceConflicts(
  conflicts: EntityConflict<InvoiceConflictType>[],
  policy?: InvoicePolicyRule[],
  tenantOverrides?: Partial<Record<InvoiceConflictType, PolicyAction>>,
): PolicyEvaluationResult<InvoiceConflictType>[] {
  const merged: Record<InvoiceConflictType, { action: PolicyAction; reason: string }> = {} as never;

  // Build policy map from provided rules (or empty if none)
  for (const rule of policy ?? []) {
    merged[rule.conflictType] = { action: rule.action, reason: rule.reason };
  }

  // Apply tenant overrides
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
