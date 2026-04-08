/**
 * Approval Service
 *
 * Creates approval requests and processes decisions.
 * The engine calls this; external callers (API routes) submit decisions.
 */

import type { ApprovalStore } from '../storage/approval-store.js';
import type { ApprovalRequest, ApprovalDecision } from './approval-request.js';
import type { OperationRequest } from '../core/operation.js';
import { makeError, type OperationError } from '../core/operation-error.js';

/** Default approval TTL: 48 hours. */
const DEFAULT_APPROVAL_TTL_MS = 48 * 60 * 60 * 1000;

export class ApprovalService {
  constructor(private readonly store: ApprovalStore) {}

  async createRequest(
    request: OperationRequest,
    reason: string,
    approvalId: string,
  ): Promise<ApprovalRequest> {
    const approval: ApprovalRequest = {
      approvalId,
      operationId: request.operationId,
      tenantId: request.tenantId,
      commandName: request.commandName,
      reason,
      status: 'pending',
      requestedAt: new Date(),
      expiresAt: new Date(Date.now() + DEFAULT_APPROVAL_TTL_MS),
    };
    await this.store.upsert(approval);
    return approval;
  }

  async decide(decision: ApprovalDecision): Promise<ApprovalRequest | OperationError> {
    const approval = await this.store.get(decision.tenantId, decision.approvalId);
    if (!approval) {
      return makeError(
        'TARGET_NOT_FOUND',
        `Approval request '${decision.approvalId}' not found`,
        'approval',
      );
    }

    if (approval.status !== 'pending') {
      return makeError(
        'STATE_CONFLICT',
        `Approval '${decision.approvalId}' is already ${approval.status}`,
        'approval',
      );
    }

    if (approval.expiresAt && approval.expiresAt < new Date()) {
      const expired = { ...approval, status: 'expired' as const };
      await this.store.upsert(expired);
      return makeError(
        'STATE_CONFLICT',
        `Approval '${decision.approvalId}' has expired`,
        'approval',
      );
    }

    const updated: ApprovalRequest = {
      ...approval,
      status: decision.decision,
      decidedAt: new Date(),
      decidedBy: decision.decidedBy,
      decisionNote: decision.note,
    };
    await this.store.upsert(updated);
    return updated;
  }

  async getPending(tenantId: string): Promise<ApprovalRequest[]> {
    return this.store.listPending(tenantId);
  }
}
