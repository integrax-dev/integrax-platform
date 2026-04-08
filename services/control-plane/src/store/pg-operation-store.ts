/**
 * PgOperationStore
 *
 * Postgres-backed implementation of OperationStore + OperationAttemptStore.
 * Uses operations and operation_attempts tables from migration 006.
 */

import type { OperationStore, OperationFilter } from '@integrax/operation-engine';
import type { OperationAttemptStore, OperationAttempt } from '@integrax/operation-engine';
import type { OperationRecord } from '@integrax/operation-engine';
import { pool } from './db.js';

// ─── OperationStore ───────────────────────────────────────────────────────────

export class PgOperationStore implements OperationStore {
  async get(tenantId: string, operationId: string): Promise<OperationRecord | null> {
    const res = await pool.query(
      `SELECT * FROM operations WHERE operation_id = $1 AND tenant_id = $2`,
      [operationId, tenantId],
    );
    return res.rows.length ? rowToRecord(res.rows[0]) : null;
  }

  async upsert(record: OperationRecord): Promise<void> {
    await pool.query(
      `INSERT INTO operations
         (operation_id, tenant_id, command_name, profile_id, status, actor, target,
          payload, options, context, result, errors, attempt_count, idempotency_key,
          correlation_id, approval_request_id, requested_at, status_updated_at,
          created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
       ON CONFLICT (operation_id) DO UPDATE SET
         status              = EXCLUDED.status,
         actor               = EXCLUDED.actor,
         result              = EXCLUDED.result,
         errors              = EXCLUDED.errors,
         attempt_count       = EXCLUDED.attempt_count,
         approval_request_id = EXCLUDED.approval_request_id,
         status_updated_at   = EXCLUDED.status_updated_at,
         updated_at          = EXCLUDED.updated_at`,
      [
        record.operationId,
        record.tenantId,
        record.commandName,
        record.profileId ?? null,
        record.status,
        JSON.stringify(record.actor),
        JSON.stringify(record.target),
        record.payload !== undefined ? JSON.stringify(record.payload) : null,
        record.options ? JSON.stringify(record.options) : null,
        record.context ? JSON.stringify(record.context) : null,
        record.result !== undefined ? JSON.stringify(record.result) : null,
        JSON.stringify(record.errors),
        record.attemptCount,
        record.idempotencyKey ?? null,
        record.correlationId ?? null,
        record.approvalRequestId ?? null,
        record.requestedAt,
        record.statusUpdatedAt,
        record.createdAt,
        record.updatedAt,
      ],
    );
  }

  async list(tenantId: string, filter: OperationFilter = {}): Promise<OperationRecord[]> {
    const conditions: string[] = ['tenant_id = $1'];
    const params: unknown[] = [tenantId];
    let i = 2;

    if (filter.commandName) {
      conditions.push(`command_name = $${i++}`);
      params.push(filter.commandName);
    }
    if (filter.status?.length) {
      conditions.push(`status = ANY($${i++}::text[])`);
      params.push(filter.status);
    }
    if (filter.from) {
      conditions.push(`created_at >= $${i++}`);
      params.push(filter.from);
    }
    if (filter.to) {
      conditions.push(`created_at <= $${i++}`);
      params.push(filter.to);
    }

    const limitClause = filter.limit ? `LIMIT $${i++}` : 'LIMIT 50';
    if (filter.limit) params.push(filter.limit);

    const res = await pool.query(
      `SELECT * FROM operations
       WHERE ${conditions.join(' AND ')}
       ORDER BY created_at DESC
       ${limitClause}`,
      params,
    );
    return res.rows.map(rowToRecord);
  }
}

function rowToRecord(row: Record<string, unknown>): OperationRecord {
  return {
    operationId: row['operation_id'] as string,
    tenantId: row['tenant_id'] as string,
    commandName: row['command_name'] as string,
    profileId: (row['profile_id'] as string | null) ?? undefined,
    status: row['status'] as OperationRecord['status'],
    actor: row['actor'] as OperationRecord['actor'],
    target: row['target'] as OperationRecord['target'],
    payload: row['payload'],
    options: (row['options'] as Record<string, unknown> | null) ?? undefined,
    context: (row['context'] as Record<string, unknown> | null) ?? undefined,
    result: row['result'] ?? undefined,
    errors: (row['errors'] as OperationRecord['errors']) ?? [],
    attemptCount: row['attempt_count'] as number,
    idempotencyKey: (row['idempotency_key'] as string | null) ?? undefined,
    correlationId: (row['correlation_id'] as string | null) ?? undefined,
    approvalRequestId: (row['approval_request_id'] as string | null) ?? undefined,
    requestedAt: new Date(row['requested_at'] as string),
    statusUpdatedAt: new Date(row['status_updated_at'] as string),
    createdAt: new Date(row['created_at'] as string),
    updatedAt: new Date(row['updated_at'] as string),
  };
}

// ─── OperationAttemptStore ────────────────────────────────────────────────────

export class PgOperationAttemptStore implements OperationAttemptStore {
  async record(attempt: OperationAttempt): Promise<void> {
    await pool.query(
      `INSERT INTO operation_attempts
         (attempt_id, operation_id, tenant_id, attempt_num, status, error, started_at, duration_ms)
       VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, $7)`,
      [
        attempt.operationId,
        attempt.tenantId,
        attempt.attemptNumber,
        attempt.succeeded ? 'success' : 'failed',
        attempt.error ? JSON.stringify(attempt.error) : null,
        attempt.startedAt,
        attempt.durationMs,
      ],
    );
  }

  async list(tenantId: string, operationId: string): Promise<OperationAttempt[]> {
    const res = await pool.query(
      `SELECT * FROM operation_attempts
       WHERE operation_id = $1 AND tenant_id = $2
       ORDER BY attempt_num ASC`,
      [operationId, tenantId],
    );
    return res.rows.map(rowToAttempt);
  }
}

function rowToAttempt(row: Record<string, unknown>): OperationAttempt {
  return {
    operationId: row['operation_id'] as string,
    tenantId: row['tenant_id'] as string,
    attemptNumber: row['attempt_num'] as number,
    startedAt: new Date(row['started_at'] as string),
    durationMs: row['duration_ms'] as number,
    succeeded: (row['status'] as string) === 'success',
    error: (row['error'] as OperationAttempt['error']) ?? undefined,
  };
}
