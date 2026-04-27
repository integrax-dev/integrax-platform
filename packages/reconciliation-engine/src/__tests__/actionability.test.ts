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
import { loadDefaultConfig } from '../config/loader.js';

const config = loadDefaultConfig();

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
    const [enriched] = enrichWithActionability([makeResult('SOME_DRIFT', 'AUTO_FIX')], config.conflictActions);
    expect(enriched.autoFixable).toBe(true);
    expect(enriched.routeTo).toBe('auto_fix');
    expect(enriched.suggestedAction).toBeTruthy();
  });

  it('IGNORE → autoFixable=true, routeTo=timeline_only', () => {
    const [enriched] = enrichWithActionability([makeResult('MINOR_STATUS', 'IGNORE')], config.conflictActions);
    expect(enriched.autoFixable).toBe(true);
    expect(enriched.routeTo).toBe('timeline_only');
  });

  it('ALERT → autoFixable=false, routeTo=operator_review (no entity override)', () => {
    // NAME_MISMATCH has a suggestedAction override but NO routeTo override — inherits from base ALERT
    const [enriched] = enrichWithActionability([makeResult('NAME_MISMATCH', 'ALERT', 'customer')], config.conflictActions);
    expect(enriched.autoFixable).toBe(false);
    expect(enriched.routeTo).toBe('operator_review');
  });

  it('BLOCK → autoFixable=false, routeTo=alert_channel', () => {
    const [enriched] = enrichWithActionability([makeResult('AUTHORIZATION_CODE_MISMATCH', 'BLOCK')], config.conflictActions);
    expect(enriched.autoFixable).toBe(false);
    expect(enriched.routeTo).toBe('alert_channel');
  });
});

// ─── Per-entity-type overrides ────────────────────────────────────────────────

describe('enrichWithActionability — entity conflict overrides', () => {
  it('STOCK_MISMATCH overrides routeTo to operation_engine', () => {
    const [enriched] = enrichWithActionability([makeResult('STOCK_MISMATCH', 'ALERT')], config.conflictActions);
    expect(enriched.routeTo).toBe('operation_engine');
  });

  it('PRICE_MISMATCH overrides routeTo to operation_engine', () => {
    const [enriched] = enrichWithActionability([makeResult('PRICE_MISMATCH', 'ALERT')], config.conflictActions);
    expect(enriched.routeTo).toBe('operation_engine');
  });

  it('AUTHORIZATION_CODE_MISSING overrides routeTo to operation_engine', () => {
    const [enriched] = enrichWithActionability([makeResult('AUTHORIZATION_CODE_MISSING', 'ALERT', 'invoice')], config.conflictActions);
    expect(enriched.routeTo).toBe('operation_engine');
  });

  it('TAX_ID_MISMATCH keeps base routeTo (operator_review) but has specific suggestedAction', () => {
    const [enriched] = enrichWithActionability([makeResult('TAX_ID_MISMATCH', 'BLOCK', 'customer')], config.conflictActions);
    // TAX_ID_MISMATCH override only sets suggestedAction (no routeTo override)
    expect(enriched.suggestedAction).toContain('fiscal');
  });

  it('AMOUNT_MISMATCH has CRITICAL in suggested action', () => {
    const [enriched] = enrichWithActionability([makeResult('AMOUNT_MISMATCH', 'BLOCK', 'invoice')], config.conflictActions);
    expect(enriched.suggestedAction).toContain('CRITICAL');
  });

  it('EMAIL_MISMATCH keeps autoFixable from base IGNORE', () => {
    const [enriched] = enrichWithActionability([makeResult('EMAIL_MISMATCH', 'IGNORE', 'customer')], config.conflictActions);
    // EMAIL_MISMATCH has no autoFixable override — inherits from IGNORE (true)
    expect(enriched.autoFixable).toBe(true);
  });
});

// ─── Preserves original fields ────────────────────────────────────────────────

describe('enrichWithActionability — preserves original fields', () => {
  it('does not modify conflict or action fields', () => {
    const input = makeResult('CURRENCY_MISMATCH', 'ALERT');
    const [enriched] = enrichWithActionability([input], config.conflictActions);
    expect(enriched.conflict).toBe(input.conflict);
    expect(enriched.action).toBe('ALERT');
    expect(enriched.reason).toBe(input.reason);
  });

  it('returns the same number of results as input', () => {
    const results = [
      makeResult('STOCK_MISMATCH', 'AUTO_FIX'),
      makeResult('PRICE_MISMATCH', 'ALERT'),
      makeResult('AUTHORIZATION_CODE_MISSING', 'ALERT'),
    ];
    const enriched = enrichWithActionability(results, config.conflictActions);
    expect(enriched).toHaveLength(3);
  });
});

// ─── classifyReconciliationSeverity ──────────────────────────────────────────

describe('classifyReconciliationSeverity', () => {
  it('empty results → clean', () => {
    expect(classifyReconciliationSeverity([])).toBe('clean');
  });

  it('all IGNORE → clean', () => {
    const results = enrichWithActionability([makeResult('STATUS_MISMATCH', 'IGNORE')], config.conflictActions);
    expect(classifyReconciliationSeverity(results)).toBe('clean');
  });

  it('any BLOCK → blocked (highest priority)', () => {
    const results = enrichWithActionability([
      makeResult('STOCK_MISMATCH', 'ALERT'),
      makeResult('AUTHORIZATION_CODE_MISMATCH', 'BLOCK'),
    ], config.conflictActions);
    expect(classifyReconciliationSeverity(results)).toBe('blocked');
  });

  it('ALERT but no BLOCK → review_needed', () => {
    const results = enrichWithActionability([
      makeResult('PRICE_MISMATCH', 'ALERT'),
    ], config.conflictActions);
    expect(classifyReconciliationSeverity(results)).toBe('review_needed');
  });

  it('only AUTO_FIX → informational', () => {
    const results = enrichWithActionability([
      makeResult('STOCK_MISMATCH', 'AUTO_FIX'),
    ], config.conflictActions);
    expect(classifyReconciliationSeverity(results)).toBe('informational');
  });

  it('BLOCK takes priority over ALERT in mixed set', () => {
    const results = enrichWithActionability([
      makeResult('PRICE_MISMATCH', 'ALERT'),
      makeResult('AUTHORIZATION_CODE_MISMATCH', 'BLOCK'),
      makeResult('EMAIL_MISMATCH', 'IGNORE'),
    ], config.conflictActions);
    expect(classifyReconciliationSeverity(results)).toBe('blocked');
  });
});

// ─── suggestOperationCommand ──────────────────────────────────────────────────

describe('suggestOperationCommand', () => {
  it('STOCK_MISMATCH → sync_record', () => {
    expect(suggestOperationCommand('STOCK_MISMATCH', config.conflictActions)).toBe('sync_record');
  });

  it('PRICE_MISMATCH → update_record', () => {
    expect(suggestOperationCommand('PRICE_MISMATCH', config.conflictActions)).toBe('update_record');
  });

  it('AUTHORIZATION_CODE_MISSING → approve_document', () => {
    expect(suggestOperationCommand('AUTHORIZATION_CODE_MISSING', config.conflictActions)).toBe('approve_document');
  });

  it('unknown conflict type → null', () => {
    expect(suggestOperationCommand('UNKNOWN_TYPE', config.conflictActions)).toBeNull();
  });

  it('AMOUNT_MISMATCH (no op command) → null', () => {
    expect(suggestOperationCommand('AMOUNT_MISMATCH', config.conflictActions)).toBeNull();
  });
});
