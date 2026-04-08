/**
 * PgApprovalStore
 *
 * Postgres-backed implementation of ApprovalStore.
 * Uses the approvals table from migration 006.
 */

import type { ApprovalStore, ApprovalRequest } from '@integrax/operation-engine';
import { pool } from './db.js';

export class PgApprovalStore implements ApprovalStore {
  async get(tenantId: string, approvalId: string): Promise<ApprovalRequest | null> {
    const res = await pool.query(
      `SELECT * FROM approvals WHERE approval_id = $1 AND tenant_id = $2`,
      [approvalId, tenantId],
    );
    return res.rows.length ? rowToApproval(res.rows[0]) : null;
  }

  async getByOperationId(tenantId: string, operationId: string): Promise<ApprovalRequest | null> {
    const res = await pool.query(
      `SELECT * FROM approvals WHERE operation_id = $1 AND tenant_id = $2 ORDER BY created_at DESC LIMIT 1`,
      [operationId, tenantId],
    );
    return res.rows.length ? rowToApproval(res.rows[0]) : null;
  }

  async upsert(request: ApprovalRequest): Promise<void> {
    await pool.query(
      `INSERT INTO approvals
         (approval_id, operation_id, tenant_id, command_name, reason, status,
          decided_by, note, expires_at, created_at, decided_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT (approval_id) DO UPDATE SET
         status     = EXCLUDED.status,
         decided_by = EXCLUDED.decided_by,
         note       = EXCLUDED.note,
         decided_at = EXCLUDED.decided_at`,
      [
        request.approvalId,
        request.operationId,
        request.tenantId,
        request.commandName,
        request.reason,
        request.status,
        request.decidedBy ? JSON.stringify(request.decidedBy) : null,
        request.decisionNote ?? null,
        request.expiresAt ?? null,
        request.requestedAt,
        request.decidedAt ?? null,
      ],
    );
  }

  async listPending(tenantId: string): Promise<ApprovalRequest[]> {
    const res = await pool.query(
      `SELECT * FROM approvals WHERE tenant_id = $1 AND status = 'pending' ORDER BY created_at DESC`,
      [tenantId],
    );
    return res.rows.map(rowToApproval);
  }
}

function rowToApproval(row: Record<string, unknown>): ApprovalRequest {
  return {
    approvalId: row['approval_id'] as string,
    operationId: row['operation_id'] as string,
    tenantId: row['tenant_id'] as string,
    commandName: row['command_name'] as string,
    reason: row['reason'] as string,
    status: row['status'] as ApprovalRequest['status'],
    decidedBy: (row['decided_by'] as ApprovalRequest['decidedBy']) ?? undefined,
    decisionNote: (row['note'] as string | null) ?? undefined,
    expiresAt: row['expires_at'] ? new Date(row['expires_at'] as string) : undefined,
    requestedAt: new Date(row['created_at'] as string),
    decidedAt: row['decided_at'] ? new Date(row['decided_at'] as string) : undefined,
  };
}
