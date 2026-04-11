/**
 * PgIdentityAliasStore
 *
 * Persists canonical_id ↔ (source_system, external_id) mappings.
 * Feeds the IdentityResolver on startup and persists new aliases on write.
 *
 * Uses the identity_aliases table from migration 007.
 */

import { pool } from './db.js';

export interface IdentityAlias {
  canonicalId: string;
  tenantId: string;
  sourceSystem: string;
  externalId: string;
  entityType: string;
}

export class PgIdentityAliasStore {
  async list(tenantId: string, entityType?: string): Promise<IdentityAlias[]> {
    if (entityType) {
      const res = await pool.query(
        `SELECT * FROM identity_aliases WHERE tenant_id = $1 AND entity_type = $2`,
        [tenantId, entityType],
      );
      return res.rows.map(rowToAlias);
    }
    const res = await pool.query(
      `SELECT * FROM identity_aliases WHERE tenant_id = $1`,
      [tenantId],
    );
    return res.rows.map(rowToAlias);
  }

  async save(alias: IdentityAlias): Promise<void> {
    await pool.query(
      `INSERT INTO identity_aliases (tenant_id, canonical_id, source_system, external_id, entity_type)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (tenant_id, source_system, external_id, entity_type)
       DO UPDATE SET canonical_id = EXCLUDED.canonical_id, updated_at = NOW()`,
      [alias.tenantId, alias.canonicalId, alias.sourceSystem, alias.externalId, alias.entityType],
    );
  }

  async deleteByCanonicalId(tenantId: string, canonicalId: string): Promise<void> {
    await pool.query(
      `DELETE FROM identity_aliases WHERE tenant_id = $1 AND canonical_id = $2`,
      [tenantId, canonicalId],
    );
  }
}

function rowToAlias(row: Record<string, unknown>): IdentityAlias {
  return {
    canonicalId: row['canonical_id'] as string,
    tenantId: row['tenant_id'] as string,
    sourceSystem: row['source_system'] as string,
    externalId: row['external_id'] as string,
    entityType: row['entity_type'] as string,
  };
}
