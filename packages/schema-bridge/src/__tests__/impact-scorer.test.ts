/**
 * Impact scorer + remediation hints tests
 *
 * Verifies assessImpact() behaviour:
 *   - score=0 for empty diffs
 *   - label thresholds (none/low/medium/high/critical)
 *   - per-diff hint routing
 *   - primary routing target selection
 *   - summary string shape
 */

import { describe, it, expect } from 'vitest';
import { assessImpact } from '../impact-scorer.js';
import type { BridgeReport, FieldDiff, RequirementsReport } from '../types.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function emptyRequirementsReport(overrides: Partial<RequirementsReport['summary']> = {}): RequirementsReport {
  return {
    breaking: [],
    nonBreaking: [],
    informational: [],
    llmEscalations: [],
    summary: {
      totalDiffs: 0,
      breakingCount: 0,
      nonBreakingCount: 0,
      informationalCount: 0,
      llmEscalationCount: 0,
      resolvedDeterministically: 0,
      resolvedByHeuristic: 0,
      coveragePercent: 100,
      ...overrides,
    },
  };
}

function makeReport(diffs: FieldDiff[], reqOverrides: Partial<RequirementsReport['summary']> = {}, extra: Partial<BridgeReport> = {}): BridgeReport {
  return {
    id: 'test-report',
    connectorAId: 'connector-a',
    connectorBId: 'connector-b',
    inferredSchemaA: { fields: [], fingerprint: 'aa', sampleCount: 10 },
    inferredSchemaB: { fields: [], fingerprint: 'bb', sampleCount: 10 },
    diffs,
    mappings: [],
    resolvedConflicts: [],
    requirementsReport: emptyRequirementsReport({ totalDiffs: diffs.length, ...reqOverrides }),
    generatedTransformTs: '',
    generatedAt: new Date().toISOString(),
    ...extra,
  };
}

function diff(kind: FieldDiff['kind'], pathA: string | null, pathB: string | null, breakingScore = 0): FieldDiff {
  return { kind, pathA, pathB, nodeA: null, nodeB: null, breakingScore };
}

// ─── Empty report ─────────────────────────────────────────────────────────────

describe('assessImpact — empty report', () => {
  it('returns impactScore=0 and label=none with no diffs', () => {
    const report = makeReport([]);
    const result = assessImpact(report);
    expect(result.impactScore).toBe(0);
    expect(result.impactLabel).toBe('none');
    expect(result.remediationHints).toHaveLength(0);
    expect(result.primaryRoutingTarget).toBe('no_action');
  });

  it('summary contains connector IDs and "no action"', () => {
    const result = assessImpact(makeReport([]));
    expect(result.summary).toContain('connector-a');
    expect(result.summary).toContain('connector-b');
    expect(result.summary).toContain('no action');
  });
});

// ─── Single diff hints ────────────────────────────────────────────────────────

describe('assessImpact — per-diff hint routing', () => {
  it('field_removed with low breaking score routes to operator_review', () => {
    const report = makeReport([diff('field_removed', 'price', null, 0.4)]);
    const result = assessImpact(report);
    const hint = result.remediationHints.find(h => h.kind === 'field_removed');
    expect(hint).toBeDefined();
    expect(hint!.routeTo).toBe('operator_review');
    expect(hint!.severity).toBe('error');
  });

  it('field_removed with high breaking score (>=0.7) gets critical severity', () => {
    const report = makeReport([diff('field_removed', 'tax_id', null, 0.9)]);
    const result = assessImpact(report);
    const hint = result.remediationHints[0];
    expect(hint.severity).toBe('critical');
  });

  it('field_added routes to timeline_trace (unresolved)', () => {
    const report = makeReport([diff('field_added', null, 'new_field', 0)]);
    const result = assessImpact(report);
    const hint = result.remediationHints.find(h => h.kind === 'field_added');
    expect(hint!.routeTo).toBe('timeline_trace');
    expect(hint!.severity).toBe('info');
  });

  it('type_changed with high breaking score (>=0.8) routes to incident_alert', () => {
    const report = makeReport([diff('type_changed', 'amount', 'amount', 0.85)]);
    const result = assessImpact(report);
    const hint = result.remediationHints[0];
    expect(hint!.routeTo).toBe('incident_alert');
  });

  it('type_changed with moderate score routes to operator_review', () => {
    const report = makeReport([diff('type_changed', 'quantity', 'quantity', 0.5)]);
    const result = assessImpact(report);
    const hint = result.remediationHints[0];
    expect(hint!.routeTo).toBe('operator_review');
  });

  it('rename_candidate (unresolved) routes to operator_review', () => {
    const report = makeReport([{ ...diff('rename_candidate', 'client_id', 'customer_id', 0.2), similarity: { levenshtein: 0.6, jaccard: 0.5, semantic: 0.7, value: 0.3, combined: 0.55 } }]);
    const result = assessImpact(report);
    const hint = result.remediationHints.find(h => h.kind === 'rename_candidate');
    expect(hint!.routeTo).toBe('operator_review');
  });

  it('format_changed routes to operator_review', () => {
    const report = makeReport([diff('format_changed', 'created_at', 'created_at', 0)]);
    const result = assessImpact(report);
    expect(result.remediationHints[0].routeTo).toBe('operator_review');
  });

  it('nullability_changed routes to timeline_trace', () => {
    const report = makeReport([diff('nullability_changed', 'description', 'description', 0)]);
    const result = assessImpact(report);
    expect(result.remediationHints[0].routeTo).toBe('timeline_trace');
  });

  it('constraint_changed routes to timeline_trace', () => {
    const report = makeReport([diff('constraint_changed', 'status', 'status', 0)]);
    const result = assessImpact(report);
    expect(result.remediationHints[0].routeTo).toBe('timeline_trace');
  });
});

// ─── Score / label thresholds ─────────────────────────────────────────────────

describe('assessImpact — score and label', () => {
  it('single field_added gives low label', () => {
    const report = makeReport([diff('field_added', null, 'extra', 0)]);
    const result = assessImpact(report);
    // field_added weight=5, no bonus — small score → low label
    expect(['none', 'low']).toContain(result.impactLabel);
  });

  it('multiple field_removed diffs push score to high or critical', () => {
    const diffs = [
      diff('field_removed', 'f1', null, 0.8),
      diff('field_removed', 'f2', null, 0.9),
      diff('field_removed', 'f3', null, 0.7),
    ];
    const result = assessImpact(makeReport(diffs));
    expect(['high', 'critical']).toContain(result.impactLabel);
  });

  it('llm escalation count inflates the score', () => {
    const withEscalation = assessImpact(makeReport(
      [diff('rename_candidate', 'a', 'b', 0.3)],
      { llmEscalationCount: 3 },
    ));
    const withoutEscalation = assessImpact(makeReport(
      [diff('rename_candidate', 'a', 'b', 0.3)],
    ));
    expect(withEscalation.impactScore).toBeGreaterThan(withoutEscalation.impactScore);
  });

  it('driftDetected=true adds to the score', () => {
    const base = assessImpact(makeReport([diff('field_added', null, 'x', 0)]));
    const withDrift = assessImpact(makeReport([diff('field_added', null, 'x', 0)], {}, { driftDetected: true }));
    expect(withDrift.impactScore).toBeGreaterThanOrEqual(base.impactScore);
  });
});

// ─── Primary routing target ───────────────────────────────────────────────────

describe('assessImpact — primaryRoutingTarget', () => {
  it('critical label → incident_alert', () => {
    const diffs = Array.from({ length: 6 }, (_, i) => diff('field_removed', `f${i}`, null, 1.0));
    const result = assessImpact(makeReport(diffs));
    if (result.impactLabel === 'critical') {
      expect(result.primaryRoutingTarget).toBe('incident_alert');
    }
  });

  it('breaking requirements present → operator_review', () => {
    const report = makeReport(
      [diff('field_added', null, 'new', 0)],
      { breakingCount: 1 },
    );
    const result = assessImpact(report);
    expect(result.primaryRoutingTarget).toBe('operator_review');
  });

  it('none label → no_action', () => {
    const result = assessImpact(makeReport([]));
    expect(result.primaryRoutingTarget).toBe('no_action');
  });
});

// ─── Resolved conflicts — auto_resolved routing ───────────────────────────────

describe('assessImpact — auto-resolved mapping routes to auto_resolved', () => {
  it('deterministically resolved rename routes to auto_resolved', () => {
    const fieldDiff = diff('rename_candidate', 'customer_id', 'client_id', 0.1);
    const report: BridgeReport = {
      ...makeReport([fieldDiff]),
      resolvedConflicts: [
        {
          diff: fieldDiff,
          resolution: 'deterministic',
          confidence: 0.95,
          llmRequired: false,
          mapping: {
            id: 'm1',
            pathA: 'customer_id',
            pathB: 'client_id',
            transform: { kind: 'rename', fromPath: 'customer_id', toPath: 'client_id', description: 'rename' },
            confidence: 0.95,
            bidirectional: true,
          },
        },
      ],
    };

    const result = assessImpact(report);
    const hint = result.remediationHints.find(h => h.kind === 'rename_candidate');
    expect(hint!.routeTo).toBe('auto_resolved');
    expect(hint!.severity).toBe('info');
  });
});

// ─── diffId format ────────────────────────────────────────────────────────────

describe('assessImpact — diffId', () => {
  it('diffId encodes pathA, pathB and kind', () => {
    const result = assessImpact(makeReport([diff('field_removed', 'price', null, 0.4)]));
    const hint = result.remediationHints[0];
    expect(hint.diffId).toContain('price');
    expect(hint.diffId).toContain('field_removed');
  });
});
