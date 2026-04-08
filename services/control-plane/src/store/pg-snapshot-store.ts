/**
 * PgSnapshotStore
 *
 * Postgres-backed implementation of SnapshotStore.
 * Uses the entity_snapshots table from migration 004.
 */

import type { SnapshotStore, EntitySnapshot, SnapshotFilter } from '@integrax/snapshot-store';
import type { ComparisonResult, ComparisonRule } from '@integrax/platform-kernel';
import { compareEntities } from '@integrax/platform-kernel';
import { pool } from './db.js';

export class PgSnapshotStore implements SnapshotStore {
  async get(
    tenantId: string,
    entityType: string,
    canonicalId: string,
  ): Promise<EntitySnapshot | null> {
    const res = await pool.query(
      `SELECT * FROM entity_snapshots
       WHERE tenant_id = $1 AND entity_type = $2 AND canonical_id = $3
       ORDER BY updated_at_snapshot DESC
       LIMIT 1`,
      [tenantId, entityType, canonicalId],
    );
    return res.rows.length ? rowToSnapshot(res.rows[0]) : null;
  }

  async getAll(
    tenantId: string,
    entityType: string,
    canonicalId: string,
  ): Promise<EntitySnapshot[]> {
    const res = await pool.query(
      `SELECT * FROM entity_snapshots
       WHERE tenant_id = $1 AND entity_type = $2 AND canonical_id = $3
       ORDER BY updated_at_snapshot DESC`,
      [tenantId, entityType, canonicalId],
    );
    return res.rows.map(rowToSnapshot);
  }

  async upsert(snapshot: EntitySnapshot): Promise<void> {
    await pool.query(
      `INSERT INTO entity_snapshots
         (snapshot_id, tenant_id, entity_type, canonical_id, source_system,
          external_ids, payload_hash, payload, updated_at_source, updated_at_snapshot)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (tenant_id, entity_type, canonical_id, source_system)
       DO UPDATE SET
         external_ids        = EXCLUDED.external_ids,
         payload_hash        = EXCLUDED.payload_hash,
         payload             = EXCLUDED.payload,
         updated_at_source   = EXCLUDED.updated_at_source,
         updated_at_snapshot = EXCLUDED.updated_at_snapshot`,
      [
        snapshot.snapshotId,
        snapshot.tenantId,
        snapshot.entityType,
        snapshot.canonicalId,
        snapshot.sourceSystem,
        JSON.stringify(snapshot.externalIds),
        snapshot.payloadHash,
        JSON.stringify(snapshot.payload),
        snapshot.updatedAtSource,
        snapshot.updatedAtSnapshot,
      ],
    );
  }

  async list(
    tenantId: string,
    entityType: string,
    filter: SnapshotFilter = {},
  ): Promise<EntitySnapshot[]> {
    const conditions: string[] = ['tenant_id = $1', 'entity_type = $2'];
    const params: unknown[] = [tenantId, entityType];
    let i = 3;

    if (filter.sourceSystem) {
      conditions.push(`source_system = $${i++}`);
      params.push(filter.sourceSystem);
    }
    if (filter.since) {
      conditions.push(`updated_at_snapshot >= $${i++}`);
      params.push(filter.since);
    }

    const limitClause = filter.limit ? `LIMIT $${i++}` : '';
    if (filter.limit) params.push(filter.limit);

    const res = await pool.query(
      `SELECT * FROM entity_snapshots
       WHERE ${conditions.join(' AND ')}
       ORDER BY updated_at_snapshot DESC
       ${limitClause}`,
      params,
    );
    return res.rows.map(rowToSnapshot);
  }

  diff(a: EntitySnapshot, b: EntitySnapshot, rules?: ComparisonRule[]): ComparisonResult {
    return compareEntities(
      a.payload as Record<string, unknown>,
      b.payload as Record<string, unknown>,
      rules,
    );
  }
}

function rowToSnapshot(row: Record<string, unknown>): EntitySnapshot {
  return {
    snapshotId: row['snapshot_id'] as string,
    tenantId: row['tenant_id'] as string,
    entityType: row['entity_type'] as string,
    canonicalId: row['canonical_id'] as string,
    sourceSystem: row['source_system'] as string,
    externalIds: row['external_ids'] as EntitySnapshot['externalIds'],
    payloadHash: row['payload_hash'] as string,
    payload: row['payload'] as Record<string, unknown>,
    updatedAtSource: new Date(row['updated_at_source'] as string),
    updatedAtSnapshot: new Date(row['updated_at_snapshot'] as string),
  };
}
