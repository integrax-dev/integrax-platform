/**
 * Connector SDK — Idempotency matrix tests
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  generateIdempotencyKey,
  InMemoryIdempotencyStore,
  withIdempotency,
} from '../idempotency.js';

// ─── generateIdempotencyKey — combinatorial matrix ───────────────────────────

describe('generateIdempotencyKey', () => {
  const connectors = ['mercadopago', 'afip-wsfe', 'contabilium', 'google-sheets', 'whatsapp', 'email'];
  const actions = ['get_payment', 'create_invoice', 'list_orders', 'send_message', 'search_products'];
  const tenants = ['tenant-ar-001', 'tenant-br-001', 'tenant-mx-001', 'enterprise-latam', 'free-tier-1'];

  it('produces 32-char keys', () => {
    const key = generateIdempotencyKey('c', 'a', 't', {});
    expect(key).toHaveLength(32);
  });

  it.each(connectors)('generates key for connector %s', (connector) => {
    const key = generateIdempotencyKey(connector, 'get', 'tenant-1', { id: '1' });
    expect(key).toHaveLength(32);
    expect(key).toMatch(/^[a-f0-9]+$/);
  });

  it.each(actions)('generates key for action %s', (action) => {
    const key = generateIdempotencyKey('mp', action, 'tenant-1', {});
    expect(key).toHaveLength(32);
  });

  it.each(tenants)('generates key for tenant %s', (tenant) => {
    const key = generateIdempotencyKey('mp', 'get', tenant, {});
    expect(key).toHaveLength(32);
  });

  it('same inputs → same key (deterministic)', () => {
    const params = { paymentId: 'PAY-001', currency: 'ARS' };
    const k1 = generateIdempotencyKey('mercadopago', 'get_payment', 'tenant-1', params);
    const k2 = generateIdempotencyKey('mercadopago', 'get_payment', 'tenant-1', params);
    expect(k1).toBe(k2);
  });

  const differingFields: Array<{ label: string; a: Parameters<typeof generateIdempotencyKey>; b: Parameters<typeof generateIdempotencyKey> }> = [
    {
      label: 'different connector',
      a: ['mercadopago', 'get_payment', 'tenant-1', { id: '1' }],
      b: ['afip-wsfe', 'get_payment', 'tenant-1', { id: '1' }],
    },
    {
      label: 'different action',
      a: ['mp', 'get_payment', 'tenant-1', { id: '1' }],
      b: ['mp', 'refund_payment', 'tenant-1', { id: '1' }],
    },
    {
      label: 'different tenant',
      a: ['mp', 'get_payment', 'tenant-1', { id: '1' }],
      b: ['mp', 'get_payment', 'tenant-2', { id: '1' }],
    },
    {
      label: 'different param value',
      a: ['mp', 'get_payment', 'tenant-1', { paymentId: 'PAY-001' }],
      b: ['mp', 'get_payment', 'tenant-1', { paymentId: 'PAY-002' }],
    },
    {
      label: 'different param key',
      a: ['mp', 'get_payment', 'tenant-1', { id: '1' }],
      b: ['mp', 'get_payment', 'tenant-1', { paymentId: '1' }],
    },
    {
      label: 'extra param',
      a: ['mp', 'get_payment', 'tenant-1', { id: '1' }],
      b: ['mp', 'get_payment', 'tenant-1', { id: '1', extra: true }],
    },
    {
      label: 'nested param difference',
      a: ['mp', 'search', 'tenant-1', { filter: { status: 'approved' } }],
      b: ['mp', 'search', 'tenant-1', { filter: { status: 'rejected' } }],
    },
    {
      label: 'array length difference',
      a: ['mp', 'bulk', 'tenant-1', { ids: ['1', '2'] }],
      b: ['mp', 'bulk', 'tenant-1', { ids: ['1', '2', '3'] }],
    },
  ];

  it.each(differingFields)('different keys for: $label', ({ a, b }) => {
    const k1 = generateIdempotencyKey(...a);
    const k2 = generateIdempotencyKey(...b);
    expect(k1).not.toBe(k2);
  });

  const latamParams: Array<{ connector: string; params: Record<string, unknown> }> = [
    { connector: 'afip-wsfe', params: { nroComprobante: 1, cuitReceptor: '30-11223344-5', total: '15000.50' } },
    { connector: 'mercadopago', params: { paymentId: 'PAY-001', currency: 'ARS', amount: 15000.50 } },
    { connector: 'contabilium', params: { comprobante: 'FC-001', cliente: 'CUST-123' } },
    { connector: 'google-sheets', params: { spreadsheetId: '1BxiM', range: 'Sheet1!A1:D10' } },
    { connector: 'whatsapp', params: { to: '+54911234567', template: 'order_confirmation' } },
  ];

  it.each(latamParams)('generates unique key for $connector LatAm params', ({ connector, params }) => {
    const key = generateIdempotencyKey(connector, 'action', 'tenant-ar', params);
    expect(key).toHaveLength(32);
    expect(key).toMatch(/^[a-f0-9]+$/);
  });
});

// ─── InMemoryIdempotencyStore ─────────────────────────────────────────────────

describe('InMemoryIdempotencyStore', () => {
  let store: InMemoryIdempotencyStore;

  beforeEach(() => { store = new InMemoryIdempotencyStore(); });

  it('returns null for missing key', async () => {
    expect(await store.get('nonexistent')).toBeNull();
  });

  it('stores and retrieves a record', async () => {
    const record = { key: 'k1', status: 'completed' as const, result: { ok: true }, createdAt: new Date() };
    await store.set('k1', record, 60000);
    const retrieved = await store.get('k1');
    expect(retrieved).toMatchObject({ key: 'k1', status: 'completed' });
  });

  it('deletes a record', async () => {
    const record = { key: 'k2', status: 'pending' as const, createdAt: new Date() };
    await store.set('k2', record, 60000);
    await store.delete('k2');
    expect(await store.get('k2')).toBeNull();
  });

  it('returns null for expired record', async () => {
    const record = { key: 'k3', status: 'completed' as const, result: {}, createdAt: new Date() };
    await store.set('k3', record, 1); // 1ms TTL
    await new Promise(r => setTimeout(r, 10));
    expect(await store.get('k3')).toBeNull();
  });

  it('keeps non-expired records', async () => {
    const record = { key: 'k4', status: 'completed' as const, result: {}, createdAt: new Date() };
    await store.set('k4', record, 60000);
    expect(await store.get('k4')).not.toBeNull();
  });

  const statusValues = ['pending', 'completed', 'failed'] as const;
  it.each(statusValues)('stores status=%s correctly', async (status) => {
    const record = { key: `k-${status}`, status, createdAt: new Date() };
    await store.set(record.key, record, 60000);
    const retrieved = await store.get(record.key);
    expect(retrieved?.status).toBe(status);
  });

  it('cleanup removes expired entries', async () => {
    const record = { key: 'exp', status: 'completed' as const, result: {}, createdAt: new Date() };
    await store.set('exp', record, 1);
    await new Promise(r => setTimeout(r, 10));
    store.cleanup();
    expect(await store.get('exp')).toBeNull();
  });

  it('stores multiple independent keys', async () => {
    const keys = ['k-a', 'k-b', 'k-c', 'k-d', 'k-e'];
    for (const key of keys) {
      await store.set(key, { key, status: 'completed' as const, result: { key }, createdAt: new Date() }, 60000);
    }
    for (const key of keys) {
      const rec = await store.get(key);
      expect(rec?.key).toBe(key);
    }
  });
});

// ─── withIdempotency ─────────────────────────────────────────────────────────

describe('withIdempotency', () => {
  let store: InMemoryIdempotencyStore;

  beforeEach(() => { store = new InMemoryIdempotencyStore(); });

  it('executes fn on cache miss and returns result', async () => {
    const fn = vi.fn().mockResolvedValue({ amount: 100, currency: 'ARS' });
    const result = await withIdempotency(store, 'key-1', 60000, fn);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ amount: 100, currency: 'ARS' });
  });

  it('returns cached result on second call without re-executing fn', async () => {
    const fn = vi.fn().mockResolvedValue({ amount: 200, currency: 'BRL' });
    await withIdempotency(store, 'key-2', 60000, fn);
    const result2 = await withIdempotency(store, 'key-2', 60000, fn);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(result2).toEqual({ amount: 200, currency: 'BRL' });
  });

  it('throws when operation is already pending', async () => {
    const store2 = new InMemoryIdempotencyStore();
    const pending = { key: 'pending-key', status: 'pending' as const, createdAt: new Date() };
    await store2.set('pending-key', pending, 60000);
    const fn = vi.fn().mockResolvedValue({});
    await expect(withIdempotency(store2, 'pending-key', 60000, fn)).rejects.toThrow('already in progress');
  });

  it('re-throws cached error on second call after failure', async () => {
    const store3 = new InMemoryIdempotencyStore();
    const fn = vi.fn().mockRejectedValue(new Error('AFIP service down'));
    await expect(withIdempotency(store3, 'fail-key', 60000, fn)).rejects.toThrow('AFIP service down');
    await expect(withIdempotency(store3, 'fail-key', 60000, fn)).rejects.toThrow('AFIP service down');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('marks record as completed with result', async () => {
    const fn = vi.fn().mockResolvedValue({ invoiceId: 'INV-001' });
    await withIdempotency(store, 'inv-key', 60000, fn);
    const record = await store.get('inv-key');
    expect(record?.status).toBe('completed');
    expect(record?.result).toEqual({ invoiceId: 'INV-001' });
    expect(record?.completedAt).toBeDefined();
  });

  it('marks record as failed with error info', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('Network error'));
    await expect(withIdempotency(store, 'err-key', 60000, fn)).rejects.toThrow();
    const record = await store.get('err-key');
    expect(record?.status).toBe('failed');
    expect(record?.error?.message).toBe('Network error');
  });

  it('different keys execute independently', async () => {
    const fn1 = vi.fn().mockResolvedValue({ result: 'A' });
    const fn2 = vi.fn().mockResolvedValue({ result: 'B' });
    const r1 = await withIdempotency(store, 'independent-1', 60000, fn1);
    const r2 = await withIdempotency(store, 'independent-2', 60000, fn2);
    expect(r1).toEqual({ result: 'A' });
    expect(r2).toEqual({ result: 'B' });
    expect(fn1).toHaveBeenCalledTimes(1);
    expect(fn2).toHaveBeenCalledTimes(1);
  });

  const resultTypes = [
    null,
    42,
    'string result',
    true,
    { nested: { value: 'deep' } },
    [1, 2, 3],
    { amount: 15000.50, currency: 'ARS', cuit: '30-11223344-5' },
  ];

  it.each(resultTypes)('caches result: %j', async (returnValue) => {
    const fn = vi.fn().mockResolvedValue(returnValue);
    const k = `cache-${Math.random()}`;
    const r1 = await withIdempotency(store, k, 60000, fn);
    const r2 = await withIdempotency(store, k, 60000, fn);
    expect(r1).toEqual(returnValue);
    expect(r2).toEqual(returnValue);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
