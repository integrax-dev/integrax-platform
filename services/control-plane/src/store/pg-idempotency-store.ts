/**
 * PgIdempotencyStore
 *
 * Postgres-backed implementation of IdempotencyStore.
 * Uses the idempotency_keys table from migration 006.
 */

import type { IdempotencyStore, IdempotencyRecord } from '@integrax/operation-engine';
import { pool } from './db.js';

export class PgIdempotencyStore implements IdempotencyStore {
  async get(tenantId: string, key: string): Promise<IdempotencyRecord | null> {
    const res = await pool.query(
      `SELECT * FROM idempotency_keys
       WHERE tenant_id = $1 AND key = $2 AND expires_at > NOW()`,
      [tenantId, key],
    );
    return res.rows.length ? rowToRecord(res.rows[0]) : null;
  }

  async set(record: IdempotencyRecord): Promise<void> {
    await pool.query(
      `INSERT INTO idempotency_keys (tenant_id, key, operation_id, status, payload_hash, created_at, expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (tenant_id, key) DO UPDATE SET
         operation_id = EXCLUDED.operation_id,
         status       = EXCLUDED.status,
         payload_hash = EXCLUDED.payload_hash,
         expires_at   = EXCLUDED.expires_at`,
      [
        record.tenantId,
        record.key,
        record.operationId,
        record.status,
        record.payloadHash,
        record.createdAt,
        record.expiresAt,
      ],
    );
  }

  async prune(): Promise<void> {
    await pool.query(`DELETE FROM idempotency_keys WHERE expires_at <= NOW()`);
  }
}

function rowToRecord(row: Record<string, unknown>): IdempotencyRecord {
  return {
    tenantId: row['tenant_id'] as string,
    key: row['key'] as string,
    operationId: row['operation_id'] as string,
    status: row['status'] as string,
    payloadHash: row['payload_hash'] as string,
    createdAt: new Date(row['created_at'] as string),
    expiresAt: new Date(row['expires_at'] as string),
  };
}
