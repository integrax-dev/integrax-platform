/**
 * Normalization utilities for identity matching.
 * Pure functions — no I/O.
 */

/** Lowercase, remove hyphens/underscores/spaces, strip leading zeros */
export function normalizeSku(sku: string): string {
  return sku
    .toLowerCase()
    .replace(/[-_\s]/g, '')
    .replace(/^0+/, '');
}

/**
 * Normalize a product title for comparison.
 * Strips punctuation, collapses whitespace, lowercases.
 */
export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Normalize a CUIT/CUIL: strip hyphens and spaces, keep digits only */
export function normalizeCuit(cuit: string): string {
  return cuit.replace(/[-\s]/g, '').replace(/\D/g, '');
}
