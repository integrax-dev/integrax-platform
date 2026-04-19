/**
 * Product Policy
 *
 * Maps ProductConflictType → PolicyAction.
 * Tenant overrides can replace any rule.
 */

import type { PolicyAction, PolicyEvaluationResult, EntityConflict } from '../../shared/types.js';
import { aggregateAction } from '../../shared/types.js';
import type { ProductConflictType } from './diff.js';

export type ProductPolicyRule = {
  conflictType: ProductConflictType;
  action: PolicyAction;
  reason: string;
};

export const DEFAULT_PRODUCT_POLICY: ProductPolicyRule[] = [
  { conflictType: 'CURRENCY_MISMATCH', action: 'BLOCK',    reason: 'Currency mismatch corrupts financial totals — sync must stop' },
  { conflictType: 'STOCK_MISMATCH',    action: 'ALERT',    reason: 'Stock divergence can cause oversell — alert operators' },
  { conflictType: 'PRICE_MISMATCH',    action: 'ALERT',    reason: 'Price drift requires operator confirmation before sync' },
  { conflictType: 'STATUS_MISMATCH',   action: 'IGNORE',   reason: 'Status differences are often expected across systems' },
];

export function evaluateProductConflicts(
  conflicts: EntityConflict<ProductConflictType>[],
  tenantOverrides?: Partial<Record<ProductConflictType, PolicyAction>>,
): PolicyEvaluationResult<ProductConflictType>[] {
  const merged = {} as Record<ProductConflictType, { action: PolicyAction; reason: string }>;

  for (const rule of DEFAULT_PRODUCT_POLICY) {
    merged[rule.conflictType] = { action: rule.action, reason: rule.reason };
  }

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
