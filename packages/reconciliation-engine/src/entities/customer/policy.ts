/**
 * Customer Policy
 *
 * Maps CustomerConflictType → PolicyAction.
 * TAX_ID_MISMATCH and VAT_STATUS_MISMATCH are BLOCK — they corrupt fiscal documents.
 * NAME_MISMATCH and STATUS_MISMATCH are ALERT — require operator confirmation.
 * EMAIL_MISMATCH is IGNORE — contact info drift is expected and harmless.
 */

import type { PolicyAction, PolicyEvaluationResult, EntityConflict } from '../../shared/types.js';
import { aggregateAction } from '../../shared/types.js';
import type { CustomerConflictType } from './diff.js';

export type CustomerPolicyRule = {
  conflictType: CustomerConflictType;
  action: PolicyAction;
  reason: string;
};

export const DEFAULT_CUSTOMER_POLICY: CustomerPolicyRule[] = [
  { conflictType: 'TAX_ID_MISMATCH',     action: 'BLOCK',  reason: 'Different fiscal IDs — these may not be the same legal entity' },
  { conflictType: 'VAT_STATUS_MISMATCH', action: 'BLOCK',  reason: 'VAT category mismatch will generate wrong comprobante type in AFIP' },
  { conflictType: 'NAME_MISMATCH',       action: 'ALERT',  reason: 'Name divergence may affect comprobantes and legal documents' },
  { conflictType: 'STATUS_MISMATCH',     action: 'ALERT',  reason: 'Active/inactive status divergence may block invoice creation' },
  { conflictType: 'EMAIL_MISMATCH',      action: 'IGNORE', reason: 'Contact info drift is expected across systems' },
];

export function evaluateCustomerConflicts(
  conflicts: EntityConflict<CustomerConflictType>[],
  tenantOverrides?: Partial<Record<CustomerConflictType, PolicyAction>>,
): PolicyEvaluationResult<CustomerConflictType>[] {
  const merged: Record<CustomerConflictType, { action: PolicyAction; reason: string }> = {} as never;

  for (const rule of DEFAULT_CUSTOMER_POLICY) {
    merged[rule.conflictType] = { action: rule.action, reason: rule.reason };
  }

  for (const [type, action] of Object.entries(tenantOverrides ?? {})) {
    merged[type as CustomerConflictType] = {
      action: action as PolicyAction,
      reason: 'tenant_override',
    };
  }

  return conflicts.map(conflict => {
    const rule = merged[conflict.type] ?? { action: 'ALERT' as PolicyAction, reason: 'no_rule_default' };
    return { conflict, action: rule.action, reason: rule.reason };
  });
}

export function customerRecommendation(
  evaluated: PolicyEvaluationResult<CustomerConflictType>[],
): PolicyAction | 'PROCEED' {
  return aggregateAction(evaluated.map(e => e.action));
}
