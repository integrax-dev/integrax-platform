/**
 * Operation Store
 *
 * Persists OperationRecord lifecycle state.
 * InMemory implementation for dev/test; replace with DB-backed in production.
 */

import type { OperationRecord } from '../core/operation.js';

export interface OperationStore {
  get(tenantId: string, operationId: string): Promise<OperationRecord | null>;
  upsert(record: OperationRecord): Promise<void>;
  list(tenantId: string, filter?: OperationFilter): Promise<OperationRecord[]>;
}

export interface OperationFilter {
  commandName?: string;
  status?: import('../core/operation-status.js').OperationStatus[];
  from?: Date;
  to?: Date;
  limit?: number;
}

export class InMemoryOperationStore implements OperationStore {
  private readonly store = new Map<string, OperationRecord>();

  private key(tenantId: string, operationId: string): string {
    return `${tenantId}:${operationId}`;
  }

  async get(tenantId: string, operationId: string): Promise<OperationRecord | null> {
    return this.store.get(this.key(tenantId, operationId)) ?? null;
  }

  async upsert(record: OperationRecord): Promise<void> {
    this.store.set(this.key(record.tenantId, record.operationId), record);
  }

  async list(tenantId: string, filter: OperationFilter = {}): Promise<OperationRecord[]> {
    let results = [...this.store.values()].filter(r => r.tenantId === tenantId);

    if (filter.commandName) {
      results = results.filter(r => r.commandName === filter.commandName);
    }
    if (filter.status?.length) {
      results = results.filter(r => filter.status!.includes(r.status));
    }
    if (filter.from) {
      results = results.filter(r => r.createdAt >= filter.from!);
    }
    if (filter.to) {
      results = results.filter(r => r.createdAt <= filter.to!);
    }

    // Newest first
    results.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    if (filter.limit) results = results.slice(0, filter.limit);
    return results;
  }
}
