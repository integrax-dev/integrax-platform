import { describe, it, expect, beforeEach } from 'vitest';
import {
  generateIdempotencyKey,
  InMemoryIdempotencyStore,
  withIdempotency,
} from '../idempotency.js';

describe('generateIdempotencyKey', () => {
  it('should generate consistent keys for same input', () => {
    const key1 = generateIdempotencyKey('mercadopago', 'get_payment', 'tenant1', { paymentId: '123' });
    const key2 = generateIdempotencyKey('mercadopago', 'get_payment', 'tenant1', { paymentId: '123' });

    expect(key1).toBe(key2);
  });

  it('should generate different keys for different inputs', () => {
    const key1 = generateIdempotencyKey('mercadopago', 'get_payment', 'tenant1', { paymentId: '123' });
    const key2 = generateIdempotencyKey('mercadopago', 'get_payment', 'tenant1', { paymentId: '456' });

    expect(key1).not.toBe(key2);
  });

  it('should generate different keys for different tenants', () => {
    const key1 = generateIdempotencyKey('mercadopago', 'get_payment', 'tenant1', { paymentId: '123' });
    const key2 = generateIdempotencyKey('mercadopago', 'get_payment', 'tenant2', { paymentId: '123' });

    expect(key1).not.toBe(key2);
  });

  it('should generate 32 character keys', () => {
    const key = generateIdempotencyKey('connector', 'action', 'tenant', { data: 'test' });

    expect(key).toHaveLength(32);
  });
});

describe('InMemoryIdempotencyStore', () => {
  let store: InMemoryIdempotencyStore;

  beforeEach(() => {
    store = new InMemoryIdempotencyStore();
  });

  it('should store and retrieve records', async () => {
    const record = {
      key: 'test-key',
      status: 'completed' as const,
      result: { data: 'test' },
      createdAt: new Date(),
      completedAt: new Date(),
    };

    await store.set('test-key', record, 60000);
    const retrieved = await store.get('test-key');

    expect(retrieved).toEqual(record);
  });

  it('should return null for non-existent keys', async () => {
    const result = await store.get('non-existent');

    expect(result).toBeNull();
  });

  it('should expire records after TTL', async () => {
    const record = {
      key: 'test-key',
      status: 'completed' as const,
      createdAt: new Date(),
    };

    await store.set('test-key', record, 1); // 1ms TTL

    // Wait for expiration
    await new Promise(resolve => setTimeout(resolve, 10));

    const result = await store.get('test-key');
    expect(result).toBeNull();
  });

  it('should delete records', async () => {
    const record = {
      key: 'test-key',
      status: 'completed' as const,
      createdAt: new Date(),
    };

    await store.set('test-key', record, 60000);
    await store.delete('test-key');

    const result = await store.get('test-key');
    expect(result).toBeNull();
  });
});

describe('withIdempotency', () => {
  let store: InMemoryIdempotencyStore;

  beforeEach(() => {
    store = new InMemoryIdempotencyStore();
  });

  it('should execute function on first call', async () => {
    let callCount = 0;

    const result = await withIdempotency(store, 'key1', 60000, async () => {
      callCount++;
      return { value: 42 };
    });

    expect(result).toEqual({ value: 42 });
    expect(callCount).toBe(1);
  });

  it('should return cached result on second call', async () => {
    let callCount = 0;

    const fn = async () => {
      callCount++;
      return { value: callCount };
    };

    const result1 = await withIdempotency(store, 'key1', 60000, fn);
    const result2 = await withIdempotency(store, 'key1', 60000, fn);

    expect(result1).toEqual({ value: 1 });
    expect(result2).toEqual({ value: 1 }); // Same result, not called again
    expect(callCount).toBe(1);
  });

  it('should handle errors and store failed status', async () => {
    const fn = async () => {
      throw new Error('Test error');
    };

    await expect(withIdempotency(store, 'key1', 60000, fn)).rejects.toThrow('Test error');

    const record = await store.get('key1');
    expect(record?.status).toBe('failed');
    expect(record?.error?.message).toBe('Test error');
  });

  it('should throw on subsequent calls after failure', async () => {
    const fn = async () => {
      throw new Error('Test error');
    };

    await expect(withIdempotency(store, 'key1', 60000, fn)).rejects.toThrow('Test error');
    await expect(withIdempotency(store, 'key1', 60000, fn)).rejects.toThrow('Test error');
  });
});
