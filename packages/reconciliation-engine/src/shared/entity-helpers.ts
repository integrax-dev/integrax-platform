/**
 * Shared helpers for entity matching and diffing.
 * Centralizes ManualLink and fieldDiff to avoid duplication across entity modules.
 */

import type { FieldDiff } from './types.js';

/**
 * A manually confirmed link between two external IDs in different systems.
 * Loaded from the entity_links table and passed to match functions.
 */
export interface ManualLink {
  systemA: string;
  externalIdA: string;
  systemB: string;
  externalIdB: string;
}

/** Build a FieldDiff record — thin helper to avoid repeated object literals. */
export function makeFieldDiff(
  field: string,
  valueA: unknown,
  valueB: unknown,
  systemA: string,
  systemB: string,
): FieldDiff {
  return { field, valueA, valueB, systemA, systemB };
}

/**
 * Returns true if the given external ID pair from a and b is covered by any manual link.
 * Checks both directions (A→B and B→A).
 */
export function hasManualLink(
  aExternalIds: Array<{ system: string; id: string }>,
  bExternalIds: Array<{ system: string; id: string }>,
  manualLinks: ManualLink[],
): boolean {
  return manualLinks.some(
    link =>
      (aExternalIds.some(e => e.system === link.systemA && e.id === link.externalIdA) &&
       bExternalIds.some(e => e.system === link.systemB && e.id === link.externalIdB)) ||
      (aExternalIds.some(e => e.system === link.systemB && e.id === link.externalIdB) &&
       bExternalIds.some(e => e.system === link.systemA && e.id === link.externalIdA)),
  );
}

/**
 * Returns the first external ID key that appears in both sets (system:id format).
 * Used for cross-system identity matching.
 */
export function findExternalIdOverlap(
  aExternalIds: Array<{ system: string; id: string }>,
  bExternalIds: Array<{ system: string; id: string }>,
): string | undefined {
  const aSet = new Set(aExternalIds.map(e => `${e.system}:${e.id}`));
  for (const b of bExternalIds) {
    const key = `${b.system}:${b.id}`;
    if (aSet.has(key)) return key;
  }
  return undefined;
}
