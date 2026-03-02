import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FingerprintStore } from '../fingerprint-store.js';
import type { SchemaFingerprint } from '../types.js';

function makeFp(connectorId: string, fingerprint = 'fp-hash'): SchemaFingerprint {
  return {
    connectorId,
    version: '1.0.0',
    capturedAt: new Date().toISOString(),
    fingerprint,
    endpoints: [],
    authHash: 'auth',
    infoHash: 'info',
  };
}

describe('FingerprintStore', () => {
  let tmpDir: string;
  let store: FingerprintStore;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'fp-store-test-'));
    store = new FingerprintStore(tmpDir);
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('returns null for unknown connector', async () => {
    const baseline = await store.getBaseline('unknown');
    expect(baseline).toBeNull();

    const latest = await store.getLatest('unknown');
    expect(latest).toBeNull();
  });

  it('saves and retrieves latest fingerprint', async () => {
    const fp = makeFp('my-connector', 'abc123');
    await store.save(fp);

    const latest = await store.getLatest('my-connector');
    expect(latest).not.toBeNull();
    expect(latest!.fingerprint).toBe('abc123');
  });

  it('bootstraps baseline on first save', async () => {
    const fp = makeFp('my-connector', 'first-fp');
    await store.save(fp);

    const baseline = await store.getBaseline('my-connector');
    expect(baseline).not.toBeNull();
    expect(baseline!.fingerprint).toBe('first-fp');
  });

  it('does not overwrite baseline on subsequent saves', async () => {
    const fp1 = makeFp('c', 'fp-1');
    const fp2 = makeFp('c', 'fp-2');

    await store.save(fp1);
    await store.save(fp2);

    const baseline = await store.getBaseline('c');
    const latest = await store.getLatest('c');

    expect(baseline!.fingerprint).toBe('fp-1'); // baseline stays
    expect(latest!.fingerprint).toBe('fp-2');   // latest updates
  });

  it('promoteToBaseline promotes latest to baseline', async () => {
    const fp1 = makeFp('c', 'fp-1');
    const fp2 = makeFp('c', 'fp-2');

    await store.save(fp1);
    await store.save(fp2);
    await store.promoteToBaseline('c');

    const baseline = await store.getBaseline('c');
    expect(baseline!.fingerprint).toBe('fp-2');
  });

  it('setBaseline explicitly sets baseline', async () => {
    const fp = makeFp('c', 'explicit-baseline');
    await store.setBaseline(fp);

    const baseline = await store.getBaseline('c');
    expect(baseline!.fingerprint).toBe('explicit-baseline');
  });

  it('handles multiple connectors independently', async () => {
    const fpA = makeFp('connector-a', 'fp-a');
    const fpB = makeFp('connector-b', 'fp-b');

    await store.save(fpA);
    await store.save(fpB);

    const latestA = await store.getLatest('connector-a');
    const latestB = await store.getLatest('connector-b');

    expect(latestA!.fingerprint).toBe('fp-a');
    expect(latestB!.fingerprint).toBe('fp-b');
  });

  it('creates connector directory automatically', async () => {
    const fp = makeFp('new-connector', 'some-hash');
    // Should not throw even though directory doesn't exist yet
    await expect(store.save(fp)).resolves.not.toThrow();
  });
});
