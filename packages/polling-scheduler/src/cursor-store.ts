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

  get(tenantId: string, jobId: string): PollingCursor | null {
    return this.store.get(this.key(tenantId, jobId)) ?? null;
  }

  set(cursor: PollingCursor): void {
    this.store.set(this.key(cursor.tenantId, cursor.jobId), cursor);
  }

  all(): PollingCursor[] {
    return [...this.store.values()];
  }
}
