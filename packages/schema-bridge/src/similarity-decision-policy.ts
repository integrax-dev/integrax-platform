import type {
  SimilarityDecision,
  SimilarityDecisionPolicyConfig,
  SimilarityEvidenceBreakdown,
  SimilarityScore,
} from './types.js';

const DEFAULT_AUTO_ACCEPT_THRESHOLD = 0.88;
const DEFAULT_REVIEW_THRESHOLD = 0.70;
const DEFAULT_MIN_MARGIN = 0.15;

function fallbackBreakdown(): SimilarityEvidenceBreakdown {
  return {
    lexical: 0,
    value: 0,
    structural: 0,
    businessType: 0,
    ontology: 0,
    sufficiency: 0,
  };
}

/**
 * Five explicit auto-accept rules, each with a single clear rationale.
 * Ordered from strongest evidence to weakest — first match wins.
 *
 * Rule 1 — Golden path
 *   Very high combined score + sufficient margin + multi-channel evidence.
 *   The "normal" auto-accept: high confidence from at least two independent
 *   channels (value+structural, or a lexical/ontology anchor + structural).
 *
 * Rule 2 — Value-dominant
 *   Strong combined (≥0.84) + both-sided margins clear + value signal ≥ 0.70
 *   + structural ≥ 0.70. Value overlap is the primary signal when the field
 *   names are opaque (e.g. SAP ABAP codes), validated by structural consistency.
 *
 * Rule 3 — Margin-dominant
 *   Combined ≥ 0.80 + extremely unambiguous winner (min-margin ≥ 0.40 OR
 *   dominant-margin ≥ 0.60 with min-margin ≥ 0.12) + moderate evidence.
 *   When the best match is far ahead of all others, lower raw combined is OK.
 *
 * Rule 4 — Semantic certainty
 *   Combined ≥ 0.80 + ontology or business-type anchor at ≥ 0.90 + value
 *   corroboration ≥ 0.25 + structural ≥ 0.70. Domain knowledge overrides
 *   lexical distance (e.g. "importe" ↔ "amount" with matching currency values).
 *
 * Rule 5 — Review
 *   Combined ≥ review threshold + any meaningful signal (margin, value, or
 *   semantic anchor). Goes to human/LLM review instead of being silently rejected.
 */
export class SimilarityDecisionPolicy {
  private readonly autoAcceptThreshold: number;
  private readonly reviewThreshold: number;
  private readonly minConfidenceMargin: number;

  constructor(config: SimilarityDecisionPolicyConfig = {}) {
    this.autoAcceptThreshold = config.autoAcceptThreshold ?? DEFAULT_AUTO_ACCEPT_THRESHOLD;
    this.reviewThreshold = config.reviewThreshold ?? DEFAULT_REVIEW_THRESHOLD;
    this.minConfidenceMargin = config.minConfidenceMargin ?? DEFAULT_MIN_MARGIN;
  }

  evaluate(score: SimilarityScore): SimilarityDecision {
    const sourceMargin  = score.margin           ?? 0;
    const targetMargin  = score.reciprocalMargin ?? 0;
    const minMargin     = Math.min(sourceMargin, targetMargin);
    const dominantMargin = Math.max(sourceMargin, targetMargin);
    const b             = score.evidenceBreakdown ?? fallbackBreakdown();

    // Rule 1 — Golden path
    if (
      score.combined >= Math.max(0.90, this.autoAcceptThreshold) &&
      minMargin >= this.minConfidenceMargin &&
      b.sufficiency >= 0.65 &&
      (
        (b.value >= 0.70 && b.structural >= 0.50) ||
        (Math.max(b.lexical, b.ontology) >= 0.90 && b.structural >= 0.40)
      )
    ) return 'auto_accept';

    // Rule 2 — Value-dominant (works for opaque field names)
    if (
      score.combined >= Math.max(0.84, this.autoAcceptThreshold - 0.04) &&
      minMargin >= 0.25 &&
      b.value >= 0.70 &&
      b.structural >= 0.70 &&
      b.sufficiency >= 0.65
    ) return 'auto_accept';

    // Rule 3 — Margin-dominant (overwhelmingly clear winner)
    if (
      score.combined >= Math.max(0.80, this.autoAcceptThreshold - 0.08) &&
      (minMargin >= 0.40 || (dominantMargin >= 0.60 && minMargin >= 0.12)) &&
      b.value >= 0.50 &&
      b.structural >= 0.50 &&
      b.sufficiency >= 0.60
    ) return 'auto_accept';

    // Rule 4 — Semantic certainty (ontology/business-type anchor)
    if (
      score.combined >= Math.max(0.80, this.autoAcceptThreshold - 0.08) &&
      minMargin >= 0.12 &&
      Math.max(b.businessType, b.ontology) >= 0.90 &&
      b.value >= 0.25 &&
      b.structural >= 0.70
    ) return 'auto_accept';

    // Rule 5 — Review (good score, some positive signal)
    if (
      score.combined >= this.reviewThreshold &&
      (
        minMargin >= Math.max(0.08, this.minConfidenceMargin * 0.5) ||
        b.value >= 0.70 ||
        Math.max(b.businessType, b.ontology) >= 0.90
      )
    ) return 'review';

    return 'reject';
  }

  annotate(score: SimilarityScore): SimilarityScore {
    return {
      ...score,
      decision: this.evaluate(score),
    };
  }
}

export function createSimilarityDecisionPolicy(
  config: SimilarityDecisionPolicyConfig = {},
): SimilarityDecisionPolicy {
  return new SimilarityDecisionPolicy(config);
}
