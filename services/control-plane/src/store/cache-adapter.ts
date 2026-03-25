/**
 * Cache Adapter Interface
 *
 * Abstracción async sobre el almacenamiento de cache para mapping-memory-repository.
 *
 * Implementaciones:
 *   - MemoryCacheAdapter  — Map in-process, LRU + TTL. Una sola réplica.
 *   - RedisCacheAdapter   — Redis SETEX/SCAN/DEL. Multi-réplica safe.
 *
 * Swap: en server.ts llamar a setCacheAdapter(new RedisCacheAdapter(redisClient)).
 */

// ─── Interface ────────────────────────────────────────────────────────────────

export interface ICacheAdapter<T = unknown> {
  /** Devuelve el valor o null si no existe / expiró. */
  get(key: string): Promise<T | null>;

  /** Guarda el valor con un TTL en milisegundos. */
  set(key: string, value: T, ttlMs: number): Promise<void>;

  /** Elimina la clave del cache. */
  delete(key: string): Promise<void>;

  /** Elimina todas las claves que empiezan con el prefijo dado. */
  deleteByPrefix(prefix: string): Promise<void>;
}

// ─── MemoryCacheAdapter ───────────────────────────────────────────────────────

interface MemoryEntry<T> {
  value: T;
  expiresAt: number;
}

export interface MemoryCacheOptions {
  /** Máximo de entradas antes de evictar la más antigua (LRU). Default: 500. */
  maxEntries?: number;
}

/**
 * Implementación en memoria con TTL y evicción LRU.
 * Map mantiene orden de inserción; delete+set mueve al final (más reciente).
 * El primer elemento del Map es siempre el candidato a evictar.
 *
 * Solo apta para una única instancia del proceso.
 * Para multi-réplica, usar RedisCacheAdapter.
 */
export class MemoryCacheAdapter<T = unknown> implements ICacheAdapter<T> {
  private readonly store = new Map<string, MemoryEntry<T>>();
  private readonly maxEntries: number;
  private evictionCount = 0;

  constructor(opts: MemoryCacheOptions = {}) {
    this.maxEntries = opts.maxEntries ?? 500;
  }

  async get(key: string): Promise<T | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    // LRU touch: move to end
    this.store.delete(key);
    this.store.set(key, entry);
    return entry.value;
  }

  async set(key: string, value: T, ttlMs: number): Promise<void> {
    this.store.delete(key); // move to end if re-set
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
    if (this.store.size > this.maxEntries) {
      // Evict oldest (first entry)
      this.store.delete(this.store.keys().next().value!);
      this.evictionCount++;
      if (this.evictionCount % 10 === 1) {
        // Log every 10th eviction to avoid log spam while still surfacing pressure.
        // If evictions are frequent, consider switching to RedisCacheAdapter.
        console.warn(`[MemoryCacheAdapter] LRU eviction #${this.evictionCount} — cache pressure detected (maxEntries=${this.maxEntries})`);
      }
    }
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  async deleteByPrefix(prefix: string): Promise<void> {
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) this.store.delete(key);
    }
  }

  /** Útil para tests */
  get size(): number {
    return this.store.size;
  }
}
