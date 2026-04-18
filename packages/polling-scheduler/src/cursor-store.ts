import type { PollingCursor } from './types.js';

/**
 * Almacen de cursores en memoria.
 *
 * En produccion los cursores tienen que sobrevivir reinicios, asi que esto se
 * reemplaza por una implementacion con Redis o Postgres. Las claves siguen el
 * formato `${tenantId}:${jobId}`.
 */
export class InMemoryCursorStore {
  private readonly store = new Map<string, PollingCursor>();

  private key(tenantId: string, jobId: string): string {
    return `${tenantId}:${jobId}`;
  }

  async get(tenantId: string, jobId: string): Promise<PollingCursor | null> {
    return this.store.get(this.key(tenantId, jobId)) ?? null;
  }

  async set(cursor: PollingCursor): Promise<void> {
    this.store.set(this.key(cursor.tenantId, cursor.jobId), cursor);
  }

  async all(): Promise<PollingCursor[]> {
    return [...this.store.values()];
  }
}
