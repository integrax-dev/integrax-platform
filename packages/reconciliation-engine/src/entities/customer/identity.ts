/**
 * Customer Identity Matching
 *
 * Matching priority (first confident match wins):
 *   1. Manual link  (entity_links — passed as manualLinks)
 *   2. Exact external ID overlap
 *   3. Exact taxId (CUIT/CUIL/etc.) after normalization
 *   4. Normalized taxId (strips dashes, dots, spaces) — catches format variations
 *   5. Email exact match
 *   6. Name similarity >= 0.85 (normalized before comparison)
 */

import type { CanonicalCustomer } from './canonical.js';
import type { MatchResult } from '../../shared/types.js';
import type { ManualLink } from '../../shared/entity-helpers.js';
import { hasManualLink, findExternalIdOverlap } from '../../shared/entity-helpers.js';
import { normalizeTaxId, normalizeTitle } from '../../shared/normalize.js';
import { combinedSimilarity } from '../../shared/similarity.js';
import { evaluateFuzzyIdentity } from '../../shared/fuzzy-identity.js';

export type { ManualLink };

const NAME_SIMILARITY_THRESHOLD = 0.85;

export function matchCustomer(
  a: CanonicalCustomer,
  b: CanonicalCustomer,
  manualLinks: ManualLink[] = [],
): MatchResult {
  // 1. Manual link
  if (hasManualLink(a.externalIds, b.externalIds, manualLinks)) {
    return { decision: 'match', confidence: 1.0, reason: 'manual_link' };
  }

  // 2. External ID overlap
  if (findExternalIdOverlap(a.externalIds, b.externalIds)) {
    return { decision: 'match', confidence: 0.99, reason: 'external_id_exact' };
  }

  // 3 & 4. TaxId — normalize both sides to handle format variations
  if (a.taxId && b.taxId) {
    if (a.taxId === b.taxId) {
      return { decision: 'match', confidence: 0.98, reason: 'tax_id_exact' };
    }
    const normA = normalizeTaxId(a.taxId);
    const normB = normalizeTaxId(b.taxId);
    if (normA && normB && normA === normB) {
      return { decision: 'match', confidence: 0.95, reason: 'tax_id_normalized' };
    }
  }

  // 5. Email exact match (reliable but not as strong as taxId — could be shared)
  if (a.email && b.email && a.email.toLowerCase() === b.email.toLowerCase()) {
    return { decision: 'review', confidence: 0.80, reason: 'email_exact' };
  }

  // 6. Name similarity — normalize before comparison so punctuation/casing don't hurt
  // "Empresa S.A." vs "Empresa SA" should score high
  if (a.name && b.name) {
    const normA = normalizeTitle(a.name);
    const normB = normalizeTitle(b.name);
    const score = combinedSimilarity(normA, normB);
    if (score >= NAME_SIMILARITY_THRESHOLD) {
      return { decision: 'review', confidence: score, reason: 'name_similarity' };
    }
  }

  // 7. Fuzzy Identity (probabilistic evaluation of weak signals)
  const fuzzy = evaluateFuzzyIdentity(a as unknown as Record<string, unknown>, b as unknown as Record<string, unknown>);
  if (fuzzy.decision !== 'no_match') {
    return fuzzy;
  }

  return { decision: 'no_match', confidence: 0, reason: 'no_signal' };
}
