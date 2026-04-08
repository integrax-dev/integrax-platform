/**
 * PgTimelineStore
 *
 * Postgres-backed implementation of TimelineStore.
 * Uses the timeline_entries table from migration 005.
 */

import type {
  TimelineStore,
  TimelineEntry,
  TimelineEntryInput,
  TimelineFilter,
  ConflictTrace,
} from '@integrax/timeline';
import { pool } from './db.js';

let _ulid: (() => string) | undefined;
async function ulid(): Promise<string> {
  if (!_ulid) {
    const mod = await import('@integrax/entities');
    _ulid = mod.ulid;
  }
  return _ulid!();
}

export class PgTimelineStore implements TimelineStore {
  async append(tenantId: string, entry: TimelineEntryInput): Promise<TimelineEntry> {
    const id = await ulid();
    const now = new Date();

    // Extract top-level fields; the rest goes into data JSONB
    const { kind, occurredAt, note, ...rest } = entry as TimelineEntry & Record<string, unknown>;
    const entityType = (rest['entityType'] as string | undefined) ?? null;
    const entityId = (rest['canonicalId'] as string | undefined) ?? null;

    await pool.query(
      `INSERT INTO timeline_entries (id, kind, tenant_id, entity_type, entity_id, occurred_at, recorded_at, data, note)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [id, kind, tenantId, entityType, entityId, occurredAt, now, JSON.stringify(rest), note ?? null],
    );

    return { id, recordedAt: now, ...(entry as object) } as TimelineEntry;
  }

  async list(tenantId: string, filter: TimelineFilter = {}): Promise<TimelineEntry[]> {
    const conditions: string[] = ['tenant_id = $1'];
    const params: unknown[] = [tenantId];
    let i = 2;

    if (filter.kind) {
      const kinds = Array.isArray(filter.kind) ? filter.kind : [filter.kind];
      conditions.push(`kind = ANY($${i++}::text[])`);
      params.push(kinds);
    }
    if (filter.entityType) {
      conditions.push(`entity_type = $${i++}`);
      params.push(filter.entityType);
    }
    if (filter.canonicalId) {
      conditions.push(`entity_id = $${i++}`);
      params.push(filter.canonicalId);
    }
    if (filter.from) {
      conditions.push(`occurred_at >= $${i++}`);
      params.push(filter.from);
    }
    if (filter.to) {
      conditions.push(`occurred_at <= $${i++}`);
      params.push(filter.to);
    }
    if (filter.after) {
      conditions.push(`id > $${i++}`);
      params.push(filter.after);
    }

    const limitClause = filter.limit ? `LIMIT $${i++}` : 'LIMIT 100';
    if (filter.limit) params.push(filter.limit);

    const res = await pool.query(
      `SELECT * FROM timeline_entries
       WHERE ${conditions.join(' AND ')}
       ORDER BY occurred_at DESC
       ${limitClause}`,
      params,
    );
    return res.rows.map(rowToEntry);
  }

  async get(tenantId: string, id: string): Promise<TimelineEntry | null> {
    const res = await pool.query(
      `SELECT * FROM timeline_entries WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId],
    );
    return res.rows.length ? rowToEntry(res.rows[0]) : null;
  }

  async resolveConflict(
    tenantId: string,
    id: string,
    resolution: Pick<ConflictTrace, 'status' | 'resolvedAt' | 'resolvedBy' | 'resolution'>,
  ): Promise<ConflictTrace> {
    const entry = await this.get(tenantId, id);
    if (!entry || entry.kind !== 'conflict') {
      throw new Error(`Conflict trace '${id}' not found for tenant '${tenantId}'`);
    }
    const updated = {
      ...(entry as ConflictTrace),
      status: resolution.status,
      resolvedAt: resolution.resolvedAt,
      resolvedBy: resolution.resolvedBy,
      resolution: resolution.resolution,
    };
    // Update the JSONB data column with the mutation fields
    await pool.query(
      `UPDATE timeline_entries
       SET data = data || $1::jsonb
       WHERE id = $2 AND tenant_id = $3`,
      [
        JSON.stringify({
          status: resolution.status,
          resolvedAt: resolution.resolvedAt,
          resolvedBy: resolution.resolvedBy,
          resolution: resolution.resolution,
        }),
        id,
        tenantId,
      ],
    );
    return updated;
  }
}

function rowToEntry(row: Record<string, unknown>): TimelineEntry {
  const data = (row['data'] as Record<string, unknown>) ?? {};
  return {
    id: row['id'] as string,
    kind: row['kind'] as TimelineEntry['kind'],
    tenantId: row['tenant_id'] as string,
    occurredAt: new Date(row['occurred_at'] as string),
    recordedAt: new Date(row['recorded_at'] as string),
    note: (row['note'] as string | undefined) ?? undefined,
    ...data,
  } as TimelineEntry;
}
