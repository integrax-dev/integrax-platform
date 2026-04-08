/**
 * Canonicalizer
 *
 * Maps raw API responses to canonical entity payloads using the field
 * mappings declared in a ConnectorManifest.
 *
 * Field mapping rules (from manifest.entities[type].fields):
 *   - key   = canonical field name
 *   - value = dot-notation path in the raw object ('' = omit the field)
 *
 * The canonical ID is derived from the manifest's identity.primary fields,
 * passed through platform-kernel's IdentityResolver for cross-system stability.
 */

import { ulid } from '@integrax/entities';
import { IdentityResolver } from '@integrax/platform-kernel';
import type { ConnectorManifest } from '@integrax/connector-sdk';
import type { CanonicalizedEntity } from './types.js';

/** Read a value at a dot-notation path from a plain object. */
function getNestedValue(
  obj: Record<string, unknown>,
  path: string,
): unknown {
  if (!path) return undefined;
  const parts = path.split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

export class Canonicalizer {
  /**
   * One IdentityResolver per logical tenant namespace so that cross-system
   * entity deduplication is scoped correctly. Callers must pass the same
   * resolver instance across all canonicalize() calls for a given tenant.
   */
  canonicalize(
    rawItem: Record<string, unknown>,
    entityType: string,
    connectorId: string,
    manifest: ConnectorManifest,
    resolver: IdentityResolver,
  ): CanonicalizedEntity | null {
    const entityManifest = manifest.entities?.[entityType];
    if (!entityManifest) return null;

    // ── 1. Build the external ID from identity.primary fields ─────────────
    const primaryKey = entityManifest.identity.primary
      .map(field => {
        // Primary field may be a raw path or an alias in fields map
        const mappedPath = entityManifest.fields[field] ?? field;
        return String(getNestedValue(rawItem, mappedPath) ?? '');
      })
      .filter(v => v !== '')
      .join('|');

    if (!primaryKey) return null;

    const externalIds = [{ system: connectorId, id: primaryKey }];

    // ── 2. Resolve or mint a canonical ID ─────────────────────────────────
    const resolved = resolver.resolveOrCreate(externalIds, ulid, rawItem as Record<string, unknown>);
    const canonicalId = resolved.canonicalId;

    // ── 3. Map raw fields to canonical payload ────────────────────────────
    const payload: Record<string, unknown> = {};
    for (const [canonicalField, rawPath] of Object.entries(entityManifest.fields)) {
      if (!rawPath) continue;
      const value = getNestedValue(rawItem, rawPath);
      if (value !== undefined) {
        payload[canonicalField] = value;
      }
    }

    // ── 4. Extract updatedAt timestamp ────────────────────────────────────
    const cursorFields = manifest.cursor_fields ?? [];
    let updatedAt = new Date();
    for (const cf of cursorFields) {
      const rawDate = getNestedValue(rawItem, cf);
      if (rawDate) {
        const parsed = new Date(rawDate as string);
        if (!isNaN(parsed.getTime())) {
          updatedAt = parsed;
          break;
        }
      }
    }

    return {
      canonicalId,
      externalIds,
      entityType,
      sourceSystem: connectorId,
      payload,
      updatedAt,
    };
  }
}
