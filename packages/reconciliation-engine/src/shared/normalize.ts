/**
 * Normalization utilities for identity matching.
 * Pure functions — no I/O, no country-specific logic.
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

/**
 * Normalize any tax / fiscal identifier: strip formatting characters
 * (hyphens, dots, spaces) and keep only digits.
 * Works for CUIT (AR), CNPJ/CPF (BR), RFC (MX), EIN (US), etc.
 */
export function normalizeTaxId(id: string): string {
  return id.replace(/[-.\s]/g, '').replace(/\D/g, '');
}
