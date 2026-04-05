/**
 * Product Identity Matching
 *
 * Given two CanonicalProduct instances from different systems,
 * determines whether they represent the same real-world product.
 *
 * Matching priority (first confident match wins):
 *   1. Manual link  (entity_links table — passed in as manualLinks)
 *   2. Exact external ID overlap
 *   3. Exact SKU match
 *   4. Normalized SKU match
 *   5. Title similarity ≥ 0.85
 *   6. Brand + variant combination
 */

import type { CanonicalProduct } from './canonical.js';
import type { MatchResult } from '../../shared/types.js';
import type { ManualLink } from '../../shared/entity-helpers.js';
import { hasManualLink, findExternalIdOverlap } from '../../shared/entity-helpers.js';
import { normalizeSku, normalizeTitle } from '../../shared/normalize.js';
import { combinedSimilarity } from '../../shared/similarity.js';

export type { ManualLink };

const TITLE_SIMILARITY_THRESHOLD = 0.85;

export function matchProduct(
  a: CanonicalProduct,
  b: CanonicalProduct,
  manualLinks: ManualLink[] = [],
): MatchResult {
  // 1. Manual link — highest confidence, always wins
  if (hasManualLink(a.externalIds, b.externalIds, manualLinks)) {
    return { decision: 'match', confidence: 1.0, reason: 'manual_link' };
  }

  // 2. External ID overlap — same system+id in both
  if (findExternalIdOverlap(a.externalIds, b.externalIds)) {
    return { decision: 'match', confidence: 0.99, reason: 'external_id_exact' };
  }

  // 3. Exact SKU
  if (a.sku && b.sku && a.sku === b.sku) {
    return { decision: 'match', confidence: 0.95, reason: 'sku_exact' };
  }

  // 4. Normalized SKU
  if (a.sku && b.sku) {
    const normA = normalizeSku(a.sku);
    const normB = normalizeSku(b.sku);
    if (normA && normB && normA === normB) {
      return { decision: 'match', confidence: 0.90, reason: 'sku_normalized' };
    }
  }

  // 5. Title similarity
  if (a.title && b.title) {
    const titleA = normalizeTitle(a.title);
    const titleB = normalizeTitle(b.title);
    const titleScore = combinedSimilarity(titleA, titleB);

    if (titleScore >= TITLE_SIMILARITY_THRESHOLD) {
      if (a.brand && b.brand && a.brand.toLowerCase() === b.brand.toLowerCase()) {
        return { decision: 'match', confidence: 0.88, reason: 'title_brand_similarity' };
      }
      if (titleScore >= 0.95) {
        return { decision: 'match', confidence: 0.85, reason: 'title_similarity_high' };
      }
      return { decision: 'review', confidence: titleScore, reason: 'title_similarity' };
    }

    // 6. Brand + variant combination (weaker signal, always → review)
    if (a.brand && b.brand && a.variant && b.variant) {
      const brandMatch = a.brand.toLowerCase() === b.brand.toLowerCase();
      const variantScore = combinedSimilarity(
        normalizeTitle(a.variant),
        normalizeTitle(b.variant),
      );
      if (brandMatch && variantScore >= 0.80) {
        return { decision: 'review', confidence: 0.70, reason: 'brand_variant_similarity' };
      }
    }
  }

  return { decision: 'no_match', confidence: 0, reason: 'no_signal' };
}
