/**
 * Approval Store
 *
 * Persists ApprovalRequests and their decisions.
 */

import type { ApprovalRequest } from '../approvals/approval-request.js';

export interface ApprovalStore {
  get(tenantId: string, approvalId: string): Promise<ApprovalRequest | null>;
  getByOperationId(tenantId: string, operationId: string): Promise<ApprovalRequest | null>;
  upsert(request: ApprovalRequest): Promise<void>;
  listPending(tenantId: string): Promise<ApprovalRequest[]>;
}

export class InMemoryApprovalStore implements ApprovalStore {
  private readonly store = new Map<string, ApprovalRequest>();
  private readonly byOperation = new Map<string, string>(); // operationId → approvalId

  private key(tenantId: string, approvalId: string): string {
    return `${tenantId}:${approvalId}`;
  }

  async get(tenantId: string, approvalId: string): Promise<ApprovalRequest | null> {
    return this.store.get(this.key(tenantId, approvalId)) ?? null;
  }

  async getByOperationId(tenantId: string, operationId: string): Promise<ApprovalRequest | null> {
    const approvalId = this.byOperation.get(`${tenantId}:${operationId}`);
    if (!approvalId) return null;
    return this.store.get(this.key(tenantId, approvalId)) ?? null;
  }

  async upsert(request: ApprovalRequest): Promise<void> {
    this.store.set(this.key(request.tenantId, request.approvalId), request);
    this.byOperation.set(`${request.tenantId}:${request.operationId}`, request.approvalId);
  }

  async listPending(tenantId: string): Promise<ApprovalRequest[]> {
    return [...this.store.values()].filter(
      r => r.tenantId === tenantId && r.status === 'pending',
    );
  }
}
