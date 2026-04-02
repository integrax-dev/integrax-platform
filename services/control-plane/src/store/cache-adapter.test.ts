/**
 * MemoryCacheAdapter unit tests
 *
 * Covers: TTL expiry, LRU eviction (maxEntries), deleteByPrefix.
 * No external dependencies.
 */

import { describe, expect, it, vi } from 'vitest';
import { MemoryCacheAdapter } from './cache-adapter.js';

describe('MemoryCacheAdapter — TTL', () => {
  it('returns null for an expired entry', async () => {
    vi.useFakeTimers();
    try {
      const cache = new MemoryCacheAdapter<string>();
      await cache.set('k', 'v', 100); // expires in 100 ms

      vi.advanceTimersByTime(101);

      expect(await cache.get('k')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('returns the value before TTL expires', async () => {
    vi.useFakeTimers();
    try {
      const cache = new MemoryCacheAdapter<string>();
      await cache.set('k', 'v', 1_000);

      vi.advanceTimersByTime(500);

      expect(await cache.get('k')).toBe('v');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('MemoryCacheAdapter — LRU eviction', () => {
  it('evicts the oldest entry when maxEntries is exceeded', async () => {
    const cache = new MemoryCacheAdapter<number>({ maxEntries: 3 });

    await cache.set('a', 1, 60_000);
    await cache.set('b', 2, 60_000);
    await cache.set('c', 3, 60_000);

    // Adding a 4th entry must evict 'a' (oldest / least-recently-set)
    await cache.set('d', 4, 60_000);

    expect(await cache.get('a')).toBeNull(); // evicted
    expect(await cache.get('b')).toBe(2);
    expect(await cache.get('c')).toBe(3);
    expect(await cache.get('d')).toBe(4);
    expect(cache.size).toBe(3);
  });

  it('a get() touch moves entry to "recent" so it survives eviction', async () => {
    const cache = new MemoryCacheAdapter<number>({ maxEntries: 3 });

    await cache.set('a', 1, 60_000);
    await cache.set('b', 2, 60_000);
    await cache.set('c', 3, 60_000);

    // Touch 'a' → it moves to the end → 'b' becomes the oldest
    await cache.get('a');

    // Adding 'd' must evict 'b' (now oldest), not 'a'
    await cache.set('d', 4, 60_000);

    expect(await cache.get('b')).toBeNull(); // evicted
    expect(await cache.get('a')).toBe(1);
    expect(await cache.get('c')).toBe(3);
    expect(await cache.get('d')).toBe(4);
  });

  it('handles >500 entries by capping at maxEntries', async () => {
    const MAX = 500;
    const cache = new MemoryCacheAdapter<number>({ maxEntries: MAX });

    // Insert 600 entries — the first 100 should be evicted
    for (let i = 0; i < 600; i++) {
      await cache.set(`key-${i}`, i, 60_000);
    }

    expect(cache.size).toBe(MAX);

    // Entries 0–99 were evicted
    for (let i = 0; i < 100; i++) {
      expect(await cache.get(`key-${i}`)).toBeNull();
    }

    // Entries 100–599 survived
    expect(await cache.get('key-100')).toBe(100);
    expect(await cache.get('key-599')).toBe(599);
  });
});

describe('MemoryCacheAdapter — deleteByPrefix', () => {
  it('removes all keys that start with the given prefix', async () => {
    const cache = new MemoryCacheAdapter<string>();

    await cache.set('tenant-A:sap:oracle', 'v1', 60_000);
    await cache.set('tenant-A:sap:coupa', 'v2', 60_000);
    await cache.set('tenant-B:sap:oracle', 'v3', 60_000);

    await cache.deleteByPrefix('tenant-A:');

    expect(await cache.get('tenant-A:sap:oracle')).toBeNull();
    expect(await cache.get('tenant-A:sap:coupa')).toBeNull();
    expect(await cache.get('tenant-B:sap:oracle')).toBe('v3'); // untouched
  });

  it('is a no-op when no keys match the prefix', async () => {
    const cache = new MemoryCacheAdapter<string>();
    await cache.set('foo:bar', 'v', 60_000);

    await cache.deleteByPrefix('baz:');

    expect(await cache.get('foo:bar')).toBe('v');
    expect(cache.size).toBe(1);
  });
});
