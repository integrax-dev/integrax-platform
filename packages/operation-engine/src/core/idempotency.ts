/**
 * Idempotency
 *
 * Prevents duplicate execution of operations with the same idempotencyKey.
 * The key is scoped to (tenantId, idempotencyKey) — different tenants may
 * share the same key without conflict.
 */

export interface IdempotencyRecord {
  tenantId: string;
  key: string;
  operationId: string;
  /** Status at the time the record was last written. */
  status: string;
  /** SHA-256 of the original request payload, used to detect key reuse with different payload. */
  payloadHash: string;
  createdAt: Date;
  expiresAt: Date;
}

export interface IdempotencyStore {
  get(tenantId: string, key: string): Promise<IdempotencyRecord | null>;
  set(record: IdempotencyRecord): Promise<void>;
  /** Remove expired records (called periodically). */
  prune(): Promise<void>;
}

/** Default TTL: 24 hours. Operations older than this may be re-submitted. */
export const DEFAULT_IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

/** In-process store. Replace with a Redis/DB implementation in production. */
export class InMemoryIdempotencyStore implements IdempotencyStore {
  private readonly store = new Map<string, IdempotencyRecord>();

  private key(tenantId: string, key: string): string {
    return `${tenantId}:${key}`;
  }

  async get(tenantId: string, key: string): Promise<IdempotencyRecord | null> {
    const record = this.store.get(this.key(tenantId, key));
    if (!record) return null;
    if (record.expiresAt < new Date()) {
      this.store.delete(this.key(tenantId, key));
      return null;
    }
    return record;
  }

  async set(record: IdempotencyRecord): Promise<void> {
    this.store.set(this.key(record.tenantId, record.key), record);
  }

  async prune(): Promise<void> {
    const now = new Date();
    for (const [k, v] of this.store) {
      if (v.expiresAt < now) this.store.delete(k);
    }
  }
}
