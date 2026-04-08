/**
 * Operation Attempt Store
 *
 * Records each execution attempt for an operation.
 * Used for retry accounting and audit.
 */

import type { OperationError } from '../core/operation-error.js';

export interface OperationAttempt {
  operationId: string;
  tenantId: string;
  attemptNumber: number;
  startedAt: Date;
  durationMs: number;
  succeeded: boolean;
  error?: OperationError;
}

export interface OperationAttemptStore {
  record(attempt: OperationAttempt): Promise<void>;
  list(tenantId: string, operationId: string): Promise<OperationAttempt[]>;
}

export class InMemoryOperationAttemptStore implements OperationAttemptStore {
  private readonly store = new Map<string, OperationAttempt[]>();

  private key(tenantId: string, operationId: string): string {
    return `${tenantId}:${operationId}`;
  }

  async record(attempt: OperationAttempt): Promise<void> {
    const k = this.key(attempt.tenantId, attempt.operationId);
    const existing = this.store.get(k) ?? [];
    existing.push(attempt);
    this.store.set(k, existing);
  }

  async list(tenantId: string, operationId: string): Promise<OperationAttempt[]> {
    return this.store.get(this.key(tenantId, operationId)) ?? [];
  }
}
