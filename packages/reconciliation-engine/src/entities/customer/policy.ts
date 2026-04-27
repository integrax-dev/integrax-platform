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
import type { PolicyRule } from '../../config/types.js';

export type CustomerPolicyRule = PolicyRule<CustomerConflictType>;

export function evaluateCustomerConflicts(
  conflicts: EntityConflict<CustomerConflictType>[],
  policy?: CustomerPolicyRule[],
  tenantOverrides?: Partial<Record<CustomerConflictType, PolicyAction>>,
): PolicyEvaluationResult<CustomerConflictType>[] {
  const merged: Record<CustomerConflictType, { action: PolicyAction; reason: string }> = {} as never;

  // Build policy map from provided rules (or empty if none)
  for (const rule of policy ?? []) {
    merged[rule.conflictType] = { action: rule.action, reason: rule.reason };
  }

  // Apply tenant overrides
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
