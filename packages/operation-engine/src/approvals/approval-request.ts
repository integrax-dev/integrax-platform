/**
 * Approval Request
 *
 * Represents a pending approval gate for an operation.
 * Created when ApprovalPolicy.requiresApproval() returns true.
 */

import type { OperationActor } from '../core/actor.js';

export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'expired' | 'cancelled';

export interface ApprovalRequest {
  approvalId: string;
  operationId: string;
  tenantId: string;
  commandName: string;
  /** Human-readable reason why approval is needed. */
  reason: string;
  /** Who needs to approve. Null = any approver with sufficient role. */
  requiredApprover?: OperationActor;
  status: ApprovalStatus;
  requestedAt: Date;
  expiresAt?: Date;
  decidedAt?: Date;
  decidedBy?: OperationActor;
  /** Optional note from the approver. */
  decisionNote?: string;
}

export interface ApprovalDecision {
  approvalId: string;
  tenantId: string;
  decision: 'approved' | 'rejected';
  decidedBy: OperationActor;
  note?: string;
}
