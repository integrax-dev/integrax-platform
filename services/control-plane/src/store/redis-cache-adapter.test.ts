/**
 * Tests unitarios para RedisCacheAdapter
 *
 * El cliente Redis se mockea completamente — no requiere servidor Redis real.
 * Cubre: get (hit, miss, JSON inválido), set (TTL en segundos), delete, deleteByPrefix.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RedisCacheAdapter } from './redis-cache-adapter.js';
import type { Redis } from 'ioredis';

// ─── Mock de Redis ────────────────────────────────────────────────────────────

function makeRedisMock() {
  const getMock = vi.fn();
  const setMock = vi.fn().mockResolvedValue('OK');
  const delMock = vi.fn().mockResolvedValue(1);
  const scanStreamMock = vi.fn();
  const pipelineMock = vi.fn();

  return {
    get: getMock,
    set: setMock,
    del: delMock,
    scanStream: scanStreamMock,
    pipeline: pipelineMock,
    // Getters para inspección en tests
    _mocks: { getMock, setMock, delMock, scanStreamMock, pipelineMock },
  } as unknown as Redis & { _mocks: Record<string, ReturnType<typeof vi.fn>> };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('RedisCacheAdapter — get', () => {
  it('devuelve el valor deserializado cuando Redis tiene la clave', async () => {
    const redis = makeRedisMock();
    (redis as unknown as Record<string, unknown>).get = vi.fn().mockResolvedValue(JSON.stringify({ x: 1 }));

    const adapter = new RedisCacheAdapter(redis);
    const result = await adapter.get('my-key');

    expect(result).toEqual({ x: 1 });
    expect(redis.get).toHaveBeenCalledWith('integrax:mm:my-key');
  });

  it('devuelve null cuando Redis no tiene la clave', async () => {
    const redis = makeRedisMock();
    (redis as unknown as Record<string, unknown>).get = vi.fn().mockResolvedValue(null);

    const adapter = new RedisCacheAdapter(redis);
    const result = await adapter.get('missing');

    expect(result).toBeNull();
  });

  it('devuelve null si el valor almacenado no es JSON válido', async () => {
    const redis = makeRedisMock();
    (redis as unknown as Record<string, unknown>).get = vi.fn().mockResolvedValue('not-json{{{');

    const adapter = new RedisCacheAdapter(redis);
    const result = await adapter.get('bad-key');

    expect(result).toBeNull();
  });

  it('aplica el prefijo personalizado a la clave', async () => {
    const redis = makeRedisMock();
    const getMock = vi.fn().mockResolvedValue(null);
    (redis as unknown as Record<string, unknown>).get = getMock;

    const adapter = new RedisCacheAdapter(redis, { keyPrefix: 'custom:' });
    await adapter.get('foo');

    expect(getMock).toHaveBeenCalledWith('custom:foo');
  });
});

describe('RedisCacheAdapter — set', () => {
  it('llama a SET con EX y TTL en segundos redondeado hacia arriba', async () => {
    const redis = makeRedisMock();
    const setMock = vi.fn().mockResolvedValue('OK');
    (redis as unknown as Record<string, unknown>).set = setMock;

    const adapter = new RedisCacheAdapter(redis);
    await adapter.set('k', { data: 42 }, 90_000); // 90 segundos

    expect(setMock).toHaveBeenCalledWith(
      'integrax:mm:k',
      JSON.stringify({ data: 42 }),
      'EX',
      90,
    );
  });

  it('usa TTL mínimo de 1 segundo para valores < 1000ms', async () => {
    const redis = makeRedisMock();
    const setMock = vi.fn().mockResolvedValue('OK');
    (redis as unknown as Record<string, unknown>).set = setMock;

    const adapter = new RedisCacheAdapter(redis);
    await adapter.set('k', 'v', 500); // 0.5 segundos → debe subir a 1 s

    const [, , , ttl] = setMock.mock.calls[0];
    expect(ttl).toBe(1);
  });

  it('redondea 1001ms a 2 segundos (Math.ceil)', async () => {
    const redis = makeRedisMock();
    const setMock = vi.fn().mockResolvedValue('OK');
    (redis as unknown as Record<string, unknown>).set = setMock;

    const adapter = new RedisCacheAdapter(redis);
    await adapter.set('k', 'v', 1001);

    const [, , , ttl] = setMock.mock.calls[0];
    expect(ttl).toBe(2);
  });
});

describe('RedisCacheAdapter — delete', () => {
  it('llama a DEL con la clave prefijada', async () => {
    const redis = makeRedisMock();
    const delMock = vi.fn().mockResolvedValue(1);
    (redis as unknown as Record<string, unknown>).del = delMock;

    const adapter = new RedisCacheAdapter(redis);
    await adapter.delete('session:abc');

    expect(delMock).toHaveBeenCalledWith('integrax:mm:session:abc');
  });
});

describe('RedisCacheAdapter — deleteByPrefix', () => {
  it('no llama a pipeline si no hay claves que coincidan', async () => {
    const redis = makeRedisMock();

    // scanStream devuelve un async iterable vacío
    async function* emptyStream() {}
    (redis as unknown as Record<string, unknown>).scanStream = vi.fn().mockReturnValue(emptyStream());
    const pipelineMock = vi.fn();
    (redis as unknown as Record<string, unknown>).pipeline = pipelineMock;

    const adapter = new RedisCacheAdapter(redis);
    await adapter.deleteByPrefix('tenant-missing:');

    expect(pipelineMock).not.toHaveBeenCalled();
  });

  it('elimina todas las claves encontradas usando pipeline', async () => {
    const redis = makeRedisMock();

    const foundKeys = ['integrax:mm:ten_01:mp:cl', 'integrax:mm:ten_01:shopify:tn'];

    async function* mockStream() {
      yield foundKeys;
    }
    (redis as unknown as Record<string, unknown>).scanStream = vi.fn().mockReturnValue(mockStream());

    const pipelineDelMock = vi.fn();
    const pipelineExecMock = vi.fn().mockResolvedValue([]);
    (redis as unknown as Record<string, unknown>).pipeline = vi.fn().mockReturnValue({
      del: pipelineDelMock,
      exec: pipelineExecMock,
    });

    const adapter = new RedisCacheAdapter(redis);
    await adapter.deleteByPrefix('ten_01:');

    expect(pipelineDelMock).toHaveBeenCalledTimes(2);
    expect(pipelineDelMock).toHaveBeenCalledWith(foundKeys[0]);
    expect(pipelineDelMock).toHaveBeenCalledWith(foundKeys[1]);
    expect(pipelineExecMock).toHaveBeenCalledTimes(1);
  });

  it('pasa el patrón correcto a scanStream (keyPrefix + prefix + *)', async () => {
    const redis = makeRedisMock();

    async function* emptyStream() {}
    const scanStreamMock = vi.fn().mockReturnValue(emptyStream());
    (redis as unknown as Record<string, unknown>).scanStream = scanStreamMock;

    const adapter = new RedisCacheAdapter(redis, { keyPrefix: 'pfx:' });
    await adapter.deleteByPrefix('ten_01:');

    expect(scanStreamMock).toHaveBeenCalledWith(
      expect.objectContaining({ match: 'pfx:ten_01:*' }),
    );
  });
});
