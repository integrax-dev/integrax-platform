import { createHash } from 'crypto';

/**
 * Generate an idempotency key from input parameters.
 */
export function generateIdempotencyKey(
  connectorId: string,
  actionId: string,
  tenantId: string,
  params: unknown
): string {
  const data = JSON.stringify({
    connector: connectorId,
    action: actionId,
    tenant: tenantId,
    params,
  });

  return createHash('sha256').update(data).digest('hex').slice(0, 32);
}

/**
 * Interface for idempotency store.
 */
export interface IdempotencyStore {
  get(key: string): Promise<IdempotencyRecord | null>;
  set(key: string, record: IdempotencyRecord, ttlMs: number): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface IdempotencyRecord {
  key: string;
  status: 'pending' | 'completed' | 'failed';
  result?: unknown;
  error?: { code: string; message: string };
  createdAt: Date;
  completedAt?: Date;
}

/**
 * In-memory idempotency store for development/testing.
 */
export class InMemoryIdempotencyStore implements IdempotencyStore {
  private store = new Map<string, { record: IdempotencyRecord; expiresAt: number }>();

  async get(key: string): Promise<IdempotencyRecord | null> {
    const entry = this.store.get(key);
    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }

    return entry.record;
  }

  async set(key: string, record: IdempotencyRecord, ttlMs: number): Promise<void> {
    this.store.set(key, {
      record,
      expiresAt: Date.now() + ttlMs,
    });
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  // Cleanup expired entries
  cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.store.entries()) {
      if (now > entry.expiresAt) {
        this.store.delete(key);
      }
    }
  }
}

/**
 * Decorator/wrapper for idempotent action execution.
 */
export async function withIdempotency<T>(
  store: IdempotencyStore,
  key: string,
  ttlMs: number,
  fn: () => Promise<T>
): Promise<T> {
  // Check for existing record
  const existing = await store.get(key);

  if (existing) {
    if (existing.status === 'completed') {
      return existing.result as T;
    }
    if (existing.status === 'pending') {
      throw new Error('Operation already in progress');
    }
    if (existing.status === 'failed' && existing.error) {
      throw new Error(existing.error.message);
    }
  }

  // Mark as pending
  await store.set(
    key,
    {
      key,
      status: 'pending',
      createdAt: new Date(),
    },
    ttlMs
  );

  try {
    const result = await fn();

    // Mark as completed
    await store.set(
      key,
      {
        key,
        status: 'completed',
        result,
        createdAt: existing?.createdAt ?? new Date(),
        completedAt: new Date(),
      },
      ttlMs
    );

    return result;
  } catch (error) {
    // Mark as failed
    await store.set(
      key,
      {
        key,
        status: 'failed',
        error: {
          code: error instanceof Error ? error.name : 'UNKNOWN',
          message: error instanceof Error ? error.message : String(error),
        },
        createdAt: existing?.createdAt ?? new Date(),
        completedAt: new Date(),
      },
      ttlMs
    );

    throw error;
  }
}
