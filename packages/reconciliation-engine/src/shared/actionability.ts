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

// ─── Per-conflict-type action metadata ───────────────────────────────────────

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

// ─── Per-entity-type overrides (more specific context) ────────────────────────

const ENTITY_CONFLICT_OVERRIDES: Record<string, Partial<ActionMeta>> = {
  // Product
  CURRENCY_MISMATCH:      { suggestedAction: 'Verify the canonical currency for this product across both systems. Update the authoritative source first, then re-sync.' },
  STOCK_MISMATCH:         { suggestedAction: 'Trigger a stock reconciliation operation (sync_record) to align inventory. If delta > threshold, investigate the root cause before syncing.', routeTo: 'operation_engine' },
  PRICE_MISMATCH:         { suggestedAction: 'Confirm the correct price with the catalog owner. Dispatch update_record once confirmed.', routeTo: 'operation_engine' },
  STATUS_MISMATCH:        { suggestedAction: 'Status divergence is usually harmless. Logged to timeline for visibility.' },

  // Customer
  TAX_ID_MISMATCH:        { suggestedAction: 'Different fiscal IDs indicate these may be separate legal entities. Do NOT merge. Open a manual review ticket.' },
  VAT_STATUS_MISMATCH:    { suggestedAction: 'Correct the VAT category in the ERP before issuing any new invoice. Mismatch causes wrong comprobante type.' },
  NAME_MISMATCH:          { suggestedAction: 'Compare full legal name in both systems. Correct the one that differs from the official AFIP record.' },
  EMAIL_MISMATCH:         { suggestedAction: 'Contact info is expected to drift. No action needed unless the customer reports communication issues.' },

  // Invoice
  AMOUNT_MISMATCH:        { suggestedAction: 'CRITICAL: Amount divergence on a fiscal document. Do not process any further payments or credits until resolved. Investigate double-entry or rounding errors.' },
  CAE_MISSING:            { suggestedAction: 'Invoice may not be authorized yet. Trigger the AFIP authorization flow (approve_document) if outstanding.', routeTo: 'operation_engine' },
  CAE_MISMATCH:           { suggestedAction: 'Different CAEs on matched invoices is a critical fiscal anomaly. Freeze sync and escalate to the fiscal team immediately.' },
  CUSTOMER_TAX_ID_MISMATCH: { suggestedAction: 'Invoice is attributed to different taxpayers — cannot reconcile automatically. Manual correction required in the authoritative system.' },
};

// Ugly but avoids adding a non-standard field to ActionMeta — carry it separately
const OPERATION_COMMANDS: Record<string, string> = {
  STOCK_MISMATCH: 'sync_record',
  PRICE_MISMATCH: 'update_record',
  CAE_MISSING:    'approve_document',
};

// ─── Main enrichment function ─────────────────────────────────────────────────

export function enrichWithActionability<TType extends string>(
  results: PolicyEvaluationResult<TType>[],
): PolicyEvaluationResult<TType>[] {
  return results.map(result => {
    const base = ACTION_META_BY_POLICY_ACTION[result.action] ?? {
      autoFixable: false,
      suggestedAction: 'Review this conflict manually.',
      routeTo: 'operator_review' as ConflictRoutingTarget,
    };

    const override = ENTITY_CONFLICT_OVERRIDES[result.conflict.type] ?? {};

    return {
      ...result,
      autoFixable: override.autoFixable ?? base.autoFixable,
      suggestedAction: override.suggestedAction ?? base.suggestedAction,
      routeTo: (override.routeTo as ConflictRoutingTarget | undefined) ?? base.routeTo,
    };
  });
}

/**
 * Returns the most appropriate operation-engine command for a conflict, if any.
 * Returns null if no automated operation applies.
 */
export function suggestOperationCommand(conflictType: string): string | null {
  return OPERATION_COMMANDS[conflictType] ?? null;
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
