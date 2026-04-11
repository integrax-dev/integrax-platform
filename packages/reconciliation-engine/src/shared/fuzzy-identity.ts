import type { MatchResult } from './types.js';
import { combinedSimilarity } from './similarity.js';

/**
 * Fuzzy Identity Engine
 *
 * Resolves identity when strict `externalIds` matching fails.
 * Probabilistically evaluates alternative strong identifiers (Email, TaxId, SKU, Name similarity).
 */

export interface FuzzyIdentityConfig {
  emailWeight: number;
  taxIdWeight: number;
  nameSimilarityThreshold: number;
}

const DEFAULT_CONFIG: FuzzyIdentityConfig = {
  emailWeight: 0.9,
  taxIdWeight: 1.0, // Tax IDs are usually deterministic
  nameSimilarityThreshold: 0.85,
};

/**
 * Evaluates fuzzy identity between two entities.
 * Returns a score between 0.0 and 1.0. 
 * A score > 0.85 is generally considered a fuzzy match.
 */
export function evaluateFuzzyIdentity(
  entityA: Record<string, any>,
  entityB: Record<string, any>,
  config: Partial<FuzzyIdentityConfig> = {}
): MatchResult {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  
  let score = 0;
  let reason = 'no_match';

  // 1. CUIT/TaxId deterministic match
  if (entityA.taxId && entityB.taxId && entityA.taxId === entityB.taxId) {
    score += cfg.taxIdWeight;
    reason = 'taxId_match';
  }

  // 2. Email deterministic match
  if (entityA.email && entityB.email && entityA.email.toLowerCase().trim() === entityB.email.toLowerCase().trim()) {
    score += cfg.emailWeight;
    reason = score > 0 ? 'taxId_and_email_match' : 'email_match';
  }

  // 3. Name similarity (Fallback)
  if (score === 0 && entityA.name && entityB.name) {
     const nameSim = combinedSimilarity(entityA.name, entityB.name);
     if (nameSim >= cfg.nameSimilarityThreshold) {
       score = nameSim * 0.8; // Penality because name alone is not as strong as taxId
       reason = 'name_similarity_match';
     }
  }

  // Evaluate final decision
  if (score >= 0.85) {
     return { decision: 'match', confidence: Math.min(score, 1.0), reason };
  } else if (score >= 0.6) {
     return { decision: 'review', confidence: score, reason: 'partial_match_requires_review' };
  }

  return { decision: 'no_match', confidence: score, reason: 'no_strong_indicators' };
}
