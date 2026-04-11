/**
 * Reconciliation-engine actionability enrichment tests
 *
 * Verifies:
 *   - enrichWithActionability() adds autoFixable / suggestedAction / routeTo
 *   - Per-conflict-type overrides take priority over base PolicyAction meta
 *   - classifyReconciliationSeverity() returns correct severity bucket
 *   - suggestOperationCommand() returns known commands for supported types
 */

import { describe, it, expect as _expect } from 'vitest';
const expect = _expect as any;
import {
  enrichWithActionability,
  classifyReconciliationSeverity,
  suggestOperationCommand,
} from '../shared/actionability.js';
import type { PolicyEvaluationResult, EntityConflict } from '../shared/types.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeConflict<T extends string>(type: T, entityType = 'product'): EntityConflict<T> {
  return {
    type,
    severity: 'MEDIUM',
    systems: ['system-a', 'system-b'],
    entityType,
    diffs: [],
    summary: `Test ${type} conflict`,
    detectedAt: new Date(),
  };
}

function makeResult<T extends string>(
  type: T,
  action: PolicyEvaluationResult['action'],
  entityType?: string,
): PolicyEvaluationResult<T> {
  return {
    conflict: makeConflict(type, entityType),
    action,
    reason: `reason for ${type}`,
  };
}

// ─── enrichWithActionability — base PolicyAction behaviour ────────────────────

describe('enrichWithActionability — base action meta', () => {
  it('AUTO_FIX → autoFixable=true, routeTo=auto_fix', () => {
    const [enriched] = enrichWithActionability([makeResult('SOME_DRIFT', 'AUTO_FIX')]);
    expect(enriched.autoFixable).toBe(true);
    expect(enriched.routeTo).toBe('auto_fix');
    expect(enriched.suggestedAction).toBeTruthy();
  });

  it('IGNORE → autoFixable=true, routeTo=timeline_only', () => {
    const [enriched] = enrichWithActionability([makeResult('MINOR_STATUS', 'IGNORE')]);
    expect(enriched.autoFixable).toBe(true);
    expect(enriched.routeTo).toBe('timeline_only');
  });

  it('ALERT → autoFixable=false, routeTo=operator_review (no entity override)', () => {
    // NAME_MISMATCH has a suggestedAction override but NO routeTo override — inherits from base ALERT
    const [enriched] = enrichWithActionability([makeResult('NAME_MISMATCH', 'ALERT', 'customer')]);
    expect(enriched.autoFixable).toBe(false);
    expect(enriched.routeTo).toBe('operator_review');
  });

  it('BLOCK → autoFixable=false, routeTo=alert_channel', () => {
    const [enriched] = enrichWithActionability([makeResult('CAE_MISMATCH', 'BLOCK')]);
    expect(enriched.autoFixable).toBe(false);
    expect(enriched.routeTo).toBe('alert_channel');
  });
});

// ─── Per-entity-type overrides ────────────────────────────────────────────────

describe('enrichWithActionability — entity conflict overrides', () => {
  it('STOCK_MISMATCH overrides routeTo to operation_engine', () => {
    const [enriched] = enrichWithActionability([makeResult('STOCK_MISMATCH', 'ALERT')]);
    expect(enriched.routeTo).toBe('operation_engine');
  });

  it('PRICE_MISMATCH overrides routeTo to operation_engine', () => {
    const [enriched] = enrichWithActionability([makeResult('PRICE_MISMATCH', 'ALERT')]);
    expect(enriched.routeTo).toBe('operation_engine');
  });

  it('CAE_MISSING overrides routeTo to operation_engine', () => {
    const [enriched] = enrichWithActionability([makeResult('CAE_MISSING', 'ALERT', 'invoice')]);
    expect(enriched.routeTo).toBe('operation_engine');
  });

  it('TAX_ID_MISMATCH keeps base routeTo (operator_review) but has specific suggestedAction', () => {
    const [enriched] = enrichWithActionability([makeResult('TAX_ID_MISMATCH', 'BLOCK', 'customer')]);
    // TAX_ID_MISMATCH override only sets suggestedAction (no routeTo override)
    expect(enriched.suggestedAction).toContain('fiscal');
  });

  it('AMOUNT_MISMATCH has CRITICAL in suggested action', () => {
    const [enriched] = enrichWithActionability([makeResult('AMOUNT_MISMATCH', 'BLOCK', 'invoice')]);
    expect(enriched.suggestedAction).toContain('CRITICAL');
  });

  it('EMAIL_MISMATCH keeps autoFixable from base IGNORE', () => {
    const [enriched] = enrichWithActionability([makeResult('EMAIL_MISMATCH', 'IGNORE', 'customer')]);
    // EMAIL_MISMATCH has no autoFixable override — inherits from IGNORE (true)
    expect(enriched.autoFixable).toBe(true);
  });
});

// ─── Preserves original fields ────────────────────────────────────────────────

describe('enrichWithActionability — preserves original fields', () => {
  it('does not modify conflict or action fields', () => {
    const input = makeResult('CURRENCY_MISMATCH', 'ALERT');
    const [enriched] = enrichWithActionability([input]);
    expect(enriched.conflict).toBe(input.conflict);
    expect(enriched.action).toBe('ALERT');
    expect(enriched.reason).toBe(input.reason);
  });

  it('returns the same number of results as input', () => {
    const results = [
      makeResult('STOCK_MISMATCH', 'AUTO_FIX'),
      makeResult('PRICE_MISMATCH', 'ALERT'),
      makeResult('CAE_MISSING', 'ALERT'),
    ];
    const enriched = enrichWithActionability(results);
    expect(enriched).toHaveLength(3);
  });
});

// ─── classifyReconciliationSeverity ──────────────────────────────────────────

describe('classifyReconciliationSeverity', () => {
  it('empty results → clean', () => {
    expect(classifyReconciliationSeverity([])).toBe('clean');
  });

  it('all IGNORE → clean', () => {
    const results = enrichWithActionability([makeResult('STATUS_MISMATCH', 'IGNORE')]);
    expect(classifyReconciliationSeverity(results)).toBe('clean');
  });

  it('any BLOCK → blocked (highest priority)', () => {
    const results = enrichWithActionability([
      makeResult('STOCK_MISMATCH', 'ALERT'),
      makeResult('CAE_MISMATCH', 'BLOCK'),
    ]);
    expect(classifyReconciliationSeverity(results)).toBe('blocked');
  });

  it('ALERT but no BLOCK → review_needed', () => {
    const results = enrichWithActionability([
      makeResult('PRICE_MISMATCH', 'ALERT'),
    ]);
    expect(classifyReconciliationSeverity(results)).toBe('review_needed');
  });

  it('only AUTO_FIX → informational', () => {
    const results = enrichWithActionability([
      makeResult('STOCK_MISMATCH', 'AUTO_FIX'),
    ]);
    expect(classifyReconciliationSeverity(results)).toBe('informational');
  });

  it('BLOCK takes priority over ALERT in mixed set', () => {
    const results = enrichWithActionability([
      makeResult('PRICE_MISMATCH', 'ALERT'),
      makeResult('CAE_MISMATCH', 'BLOCK'),
      makeResult('EMAIL_MISMATCH', 'IGNORE'),
    ]);
    expect(classifyReconciliationSeverity(results)).toBe('blocked');
  });
});

// ─── suggestOperationCommand ──────────────────────────────────────────────────

describe('suggestOperationCommand', () => {
  it('STOCK_MISMATCH → sync_record', () => {
    expect(suggestOperationCommand('STOCK_MISMATCH')).toBe('sync_record');
  });

  it('PRICE_MISMATCH → update_record', () => {
    expect(suggestOperationCommand('PRICE_MISMATCH')).toBe('update_record');
  });

  it('CAE_MISSING → approve_document', () => {
    expect(suggestOperationCommand('CAE_MISSING')).toBe('approve_document');
  });

  it('unknown conflict type → null', () => {
    expect(suggestOperationCommand('UNKNOWN_TYPE')).toBeNull();
  });

  it('AMOUNT_MISMATCH (no op command) → null', () => {
    expect(suggestOperationCommand('AMOUNT_MISMATCH')).toBeNull();
  });
});
