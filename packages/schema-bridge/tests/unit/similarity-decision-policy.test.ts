/**
 * Unit tests for SimilarityDecisionPolicy
 *
 * Las 4 reglas de auto-accept + 1 de review + reject son la defensa final
 * contra falsos positivos. Cada regla tiene un rationale diferente — testear
 * cada una en aislamiento garantiza que no se puedan romper silenciosamente.
 */
import { describe, it, expect } from 'vitest';
import { SimilarityDecisionPolicy } from '../../src/similarity-decision-policy.js';
import type { SimilarityScore } from '../../src/types.js';

function score(overrides: Partial<SimilarityScore> & { combined: number }): SimilarityScore {
  return {
    levenshtein: 0,
    jaccard: 0,
    semantic: 0,
    value: 0,
    margin: 0.20,
    reciprocalMargin: 0.20,
    evidenceBreakdown: {
      lexical: 0,
      value: 0,
      structural: 0,
      businessType: 0,
      ontology: 0,
      sufficiency: 0,
    },
    ...overrides,
  };
}

const policy = new SimilarityDecisionPolicy({ autoAcceptThreshold: 0.88 });
const strictPolicy = new SimilarityDecisionPolicy();

// ─── auto_accept ──────────────────────────────────────────────────────────────

describe('Rule 1 — Golden path (combined ≥ 0.90, value+structural)', () => {
  it('auto-accepts a clear rename with value + structural evidence', () => {
    const s = score({
      combined: 0.92,
      margin: 0.18,
      reciprocalMargin: 0.18,
      evidenceBreakdown: {
        lexical: 0.50,
        value: 0.80,
        structural: 0.60,
        businessType: 0,
        ontology: 0,
        sufficiency: 0.70,
      },
    });
    expect(policy.evaluate(s)).toBe('auto_accept');
  });

  it('auto-accepts a clear rename with lexical + structural evidence', () => {
    const s = score({
      combined: 0.91,
      margin: 0.20,
      reciprocalMargin: 0.20,
      evidenceBreakdown: {
        lexical: 0.95,
        value: 0.20,
        structural: 0.45,
        businessType: 0,
        ontology: 0,
        sufficiency: 0.70,
      },
    });
    expect(policy.evaluate(s)).toBe('auto_accept');
  });

  it('rejects when combined is high but margin is insufficient', () => {
    const s = score({
      combined: 0.92,
      margin: 0.05,
      reciprocalMargin: 0.05,
      evidenceBreakdown: {
        lexical: 0.50,
        value: 0.80,
        structural: 0.60,
        businessType: 0,
        ontology: 0,
        sufficiency: 0.70,
      },
    });
    expect(policy.evaluate(s)).not.toBe('auto_accept');
  });
});

describe('Rule 2 — Value-dominant (opaque field names like SAP ABAP codes)', () => {
  it('auto-accepts when value+structural are strong even without lexical', () => {
    const s = score({
      combined: 0.85,
      margin: 0.28,
      reciprocalMargin: 0.26,
      evidenceBreakdown: {
        lexical: 0.05,
        value: 0.75,
        structural: 0.78,
        businessType: 0,
        ontology: 0,
        sufficiency: 0.70,
      },
    });
    // WAERS → currencyCode: field names are opaque but values are currency codes
    expect(policy.evaluate(s)).toBe('auto_accept');
  });

  it('rejects when value is strong but structural is not', () => {
    const s = score({
      combined: 0.85,
      margin: 0.28,
      reciprocalMargin: 0.26,
      evidenceBreakdown: {
        lexical: 0.05,
        value: 0.75,
        structural: 0.50,
        businessType: 0,
        ontology: 0,
        sufficiency: 0.70,
      },
    });
    expect(policy.evaluate(s)).not.toBe('auto_accept');
  });
});

describe('Rule 3 — Margin-dominant (overwhelmingly clear winner)', () => {
  it('auto-accepts when margin is extremely wide', () => {
    const s = score({
      combined: 0.82,
      margin: 0.45,
      reciprocalMargin: 0.42,
      evidenceBreakdown: {
        lexical: 0.40,
        value: 0.55,
        structural: 0.55,
        businessType: 0,
        ontology: 0,
        sufficiency: 0.65,
      },
    });
    expect(policy.evaluate(s)).toBe('auto_accept');
  });

  it('auto-accepts with dominant+min margin combination', () => {
    const s = score({
      combined: 0.82,
      margin: 0.65,
      reciprocalMargin: 0.13,
      evidenceBreakdown: {
        lexical: 0.40,
        value: 0.55,
        structural: 0.55,
        businessType: 0,
        ontology: 0,
        sufficiency: 0.65,
      },
    });
    expect(policy.evaluate(s)).toBe('auto_accept');
  });
});

describe('Rule 4 — Semantic certainty (ontology/businessType anchor)', () => {
  it('auto-accepts when domain knowledge confirms the match', () => {
    const s = score({
      combined: 0.81,
      margin: 0.15,
      reciprocalMargin: 0.15,
      evidenceBreakdown: {
        lexical: 0.30,
        value: 0.30,
        structural: 0.75,
        businessType: 0.95,
        ontology: 0,
        sufficiency: 0,
      },
    });
    // "importe" ↔ "amount" with businessType=currency both 0.95
    expect(policy.evaluate(s)).toBe('auto_accept');
  });

  it('auto-accepts with ontology anchor instead of businessType', () => {
    const s = score({
      combined: 0.81,
      margin: 0.15,
      reciprocalMargin: 0.15,
      evidenceBreakdown: {
        lexical: 0.30,
        value: 0.30,
        structural: 0.75,
        businessType: 0,
        ontology: 0.92,
        sufficiency: 0,
      },
    });
    expect(policy.evaluate(s)).toBe('auto_accept');
  });
});

// ─── review ──────────────────────────────────────────────────────────────────

describe('Rule 5 — Review', () => {
  it('goes to review when combined is ≥ 0.70 with some margin', () => {
    const s = score({
      combined: 0.74,
      margin: 0.10,
      reciprocalMargin: 0.10,
      evidenceBreakdown: {
        lexical: 0.40,
        value: 0.30,
        structural: 0.40,
        businessType: 0,
        ontology: 0,
        sufficiency: 0.40,
      },
    });
    expect(policy.evaluate(s)).toBe('review');
  });

  it('goes to review when value signal is strong even with low margin', () => {
    const s = score({
      combined: 0.71,
      margin: 0.04,
      reciprocalMargin: 0.04,
      evidenceBreakdown: {
        lexical: 0.20,
        value: 0.75,
        structural: 0.30,
        businessType: 0,
        ontology: 0,
        sufficiency: 0.40,
      },
    });
    expect(policy.evaluate(s)).toBe('review');
  });
});

// ─── reject ──────────────────────────────────────────────────────────────────

describe('Reject', () => {
  it('rejects when combined is below review threshold', () => {
    const s = score({
      combined: 0.50,
      margin: 0.05,
      reciprocalMargin: 0.05,
      evidenceBreakdown: {
        lexical: 0.30,
        value: 0.20,
        structural: 0.20,
        businessType: 0,
        ontology: 0,
        sufficiency: 0.20,
      },
    });
    expect(policy.evaluate(s)).toBe('reject');
  });

  it('rejects when combined is at review threshold but no positive signal', () => {
    const s = score({
      combined: 0.72,
      margin: 0.02,
      reciprocalMargin: 0.02,
      evidenceBreakdown: {
        lexical: 0.20,
        value: 0.30,
        structural: 0.20,
        businessType: 0,
        ontology: 0,
        sufficiency: 0.20,
      },
    });
    expect(policy.evaluate(s)).toBe('reject');
  });

  it('annotate() adds decision to the score', () => {
    const s = score({ combined: 0.20 });
    const annotated = policy.annotate(s);
    expect(annotated.decision).toBe('reject');
    expect(annotated.combined).toBe(0.20);
  });
});

// ─── configurable thresholds ─────────────────────────────────────────────────

describe('Configurable thresholds', () => {
  it('default policy uses stricter 0.95 auto-accept threshold', () => {
    const s = score({
      combined: 0.92,
      margin: 0.18,
      reciprocalMargin: 0.18,
      evidenceBreakdown: {
        lexical: 0.50,
        value: 0.80,
        structural: 0.60,
        businessType: 0,
        ontology: 0,
        sufficiency: 0.70,
      },
    });
    expect(strictPolicy.evaluate(s)).not.toBe('auto_accept');
  });

  it('stricter autoAcceptThreshold → fewer auto-accepts', () => {
    const strict = new SimilarityDecisionPolicy({ autoAcceptThreshold: 0.95 });
    const s = score({
      combined: 0.92,
      margin: 0.18,
      reciprocalMargin: 0.18,
      evidenceBreakdown: {
        lexical: 0.50,
        value: 0.80,
        structural: 0.60,
        businessType: 0,
        ontology: 0,
        sufficiency: 0.70,
      },
    });
    // Default policy would auto-accept; strict policy should not
    expect(policy.evaluate(s)).toBe('auto_accept');
    expect(strict.evaluate(s)).not.toBe('auto_accept');
  });
});
