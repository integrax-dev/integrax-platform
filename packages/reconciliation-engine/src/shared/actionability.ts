/**
 * Reconciliation Actionability
 *
 * Enriches PolicyEvaluationResult with:
 *   - autoFixable: can the engine resolve this without human input?
 *   - suggestedAction: what should happen next?
 *   - routeTo: which platform layer owns the resolution?
 *
 * This is a post-processing pass applied after evaluateXConflicts().
 * It does NOT change policy rules — it adds actionability metadata.
 *
 * Usage:
 *   const evaluated = evaluateProductConflicts(conflicts);
 *   const enriched  = enrichWithActionability(evaluated);
 */

import type { PolicyEvaluationResult, ConflictRoutingTarget, PolicyAction } from './types.js';
import type { ConflictActionConfig } from '../config/types.js';

// ─── Per-policy-action base metadata ──────────────────────────────────────────

interface ActionMeta {
  autoFixable: boolean;
  suggestedAction: string;
  routeTo: ConflictRoutingTarget;
}

const ACTION_META_BY_POLICY_ACTION: Record<PolicyAction, ActionMeta> = {
  AUTO_FIX: {
    autoFixable: true,
    suggestedAction: 'Engine will apply the fix automatically on next sync cycle.',
    routeTo: 'auto_fix',
  },
  ALERT: {
    autoFixable: false,
    suggestedAction: 'Review the conflicting values and decide which system is authoritative, then re-sync.',
    routeTo: 'operator_review',
  },
  BLOCK: {
    autoFixable: false,
    suggestedAction: 'Sync halted. Operator must resolve this conflict before any further writes to either system.',
    routeTo: 'alert_channel',
  },
  IGNORE: {
    autoFixable: true,
    suggestedAction: 'No action needed. This divergence is expected and has been logged.',
    routeTo: 'timeline_only',
  },
};

// ─── Main enrichment function ─────────────────────────────────────────────────

export function enrichWithActionability<TType extends string>(
  results: PolicyEvaluationResult<TType>[],
  conflictActionConfig?: Record<string, ConflictActionConfig>,
): PolicyEvaluationResult<TType>[] {
  return results.map(result => {
    const base = ACTION_META_BY_POLICY_ACTION[result.action] ?? {
      autoFixable: false,
      suggestedAction: 'Review this conflict manually.',
      routeTo: 'operator_review' as ConflictRoutingTarget,
    };

    const override = conflictActionConfig?.[result.conflict.type];

    return {
      ...result,
      autoFixable: base.autoFixable,
      suggestedAction: override?.suggestedAction ?? base.suggestedAction,
      routeTo: (override?.routeTo as ConflictRoutingTarget | undefined) ?? base.routeTo,
    };
  });
}

/**
 * Returns the most appropriate operation-engine command for a conflict, if any.
 * Returns null if no automated operation applies.
 */
export function suggestOperationCommand(
  conflictType: string,
  conflictActionConfig?: Record<string, ConflictActionConfig>,
): string | null {
  return conflictActionConfig?.[conflictType]?.operationCommand ?? null;
}

/**
 * Classifies overall reconciliation result severity for display/routing.
 */
export function classifyReconciliationSeverity(
  results: PolicyEvaluationResult<string>[],
): 'clean' | 'informational' | 'review_needed' | 'blocked' {
  if (results.length === 0) return 'clean';
  const actions = results.map(r => r.action);
  if (actions.includes('BLOCK')) return 'blocked';
  if (actions.includes('ALERT')) return 'review_needed';
  if (actions.some(a => a === 'AUTO_FIX')) return 'informational';
  return 'clean';
}
