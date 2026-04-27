/**
 * Product Policy
 *
 * Maps ProductConflictType → PolicyAction.
 * Tenant overrides can replace any rule.
 */

import type { PolicyAction, PolicyEvaluationResult, EntityConflict } from '../../shared/types.js';
import { aggregateAction } from '../../shared/types.js';
import type { ProductConflictType } from './diff.js';
import type { PolicyRule } from '../../config/types.js';

export type ProductPolicyRule = PolicyRule<ProductConflictType>;

export function evaluateProductConflicts(
  conflicts: EntityConflict<ProductConflictType>[],
  policy?: ProductPolicyRule[],
  tenantOverrides?: Partial<Record<ProductConflictType, PolicyAction>>,
): PolicyEvaluationResult<ProductConflictType>[] {
  const merged = {} as Record<ProductConflictType, { action: PolicyAction; reason: string }>;

  // Build policy map from provided rules (or empty if none)
  for (const rule of policy ?? []) {
    merged[rule.conflictType] = { action: rule.action, reason: rule.reason };
  }

  // Apply tenant overrides
  for (const [type, action] of Object.entries(tenantOverrides ?? {})) {
    merged[type as ProductConflictType] = {
      action: action as PolicyAction,
      reason: 'tenant_override',
    };
  }

  return conflicts.map(conflict => {
    const rule = merged[conflict.type] ?? { action: 'ALERT' as PolicyAction, reason: 'no_rule_default' };
    return { conflict, action: rule.action, reason: rule.reason };
  });
}

export function productRecommendation(
  evaluated: PolicyEvaluationResult<ProductConflictType>[],
): PolicyAction | 'PROCEED' {
  return aggregateAction(evaluated.map(e => e.action));
}
