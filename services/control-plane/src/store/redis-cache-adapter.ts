/**
 * RedisCacheAdapter
 *
 * Implementación de ICacheAdapter sobre Redis (ioredis).
 * Apta para multi-réplica: todas las instancias ven el mismo estado de cache.
 *
 * Swap en server.ts:
 *   import { Redis } from 'ioredis';
 *   import { RedisCacheAdapter } from './store/redis-cache-adapter.js';
 *   import { setCacheAdapter } from './store/mapping-memory-repository.js';
 *
 *   const redis = new Redis(process.env.REDIS_URL);
 *   setCacheAdapter(new RedisCacheAdapter(redis));
 *
 * Formato de clave en Redis: `${keyPrefix}${key}` (default prefix: 'integrax:mm:').
 * TTL: convertido de ms a segundos (mínimo 1 s).
 * deleteByPrefix: usa SCAN con pipeline DEL — no bloquea el servidor.
 */

import type { Redis } from 'ioredis';
import type { ICacheAdapter } from './cache-adapter.js';

export interface RedisCacheOptions {
  /**
   * Prefijo aplicado a todas las claves en Redis.
   * Permite coexistir con otras claves del servidor sin colisiones.
   * Default: 'integrax:mm:'
   */
  keyPrefix?: string;
}

export class RedisCacheAdapter<T = unknown> implements ICacheAdapter<T> {
  private readonly keyPrefix: string;

  constructor(
    private readonly redis: Redis,
    opts: RedisCacheOptions = {},
  ) {
    this.keyPrefix = opts.keyPrefix ?? 'integrax:mm:';
  }

  private prefixed(key: string): string {
    return `${this.keyPrefix}${key}`;
  }

  async get(key: string): Promise<T | null> {
    const raw = await this.redis.get(this.prefixed(key));
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  async set(key: string, value: T, ttlMs: number): Promise<void> {
    const ttlSec = Math.max(1, Math.ceil(ttlMs / 1000));
    await this.redis.set(this.prefixed(key), JSON.stringify(value), 'EX', ttlSec);
  }

  async delete(key: string): Promise<void> {
    await this.redis.del(this.prefixed(key));
  }

  /**
   * Elimina todas las claves cuyo nombre empieza con `keyPrefix + prefix`.
   *
   * Usa SCAN (no KEYS) para no bloquear Redis en datasets grandes.
   * Agrupa los DEL en un pipeline para minimizar round-trips.
   */
  async deleteByPrefix(prefix: string): Promise<void> {
    const pattern = `${this.keyPrefix}${prefix}*`;
    const stream = this.redis.scanStream({ match: pattern, count: 100 });

    const keysToDelete: string[] = [];
    for await (const batch of stream) {
      keysToDelete.push(...(batch as string[]));
    }

    if (keysToDelete.length === 0) return;

    // Pipeline: un solo round-trip para todos los DEL
    const pipeline = this.redis.pipeline();
    for (const k of keysToDelete) {
      pipeline.del(k);
    }
    await pipeline.exec();
  }
}
