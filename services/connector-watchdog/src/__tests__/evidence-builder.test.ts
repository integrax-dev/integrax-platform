import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EvidenceBuilder } from '../evidence-builder.js';
import type { DriftReport, SchemaFingerprint } from '../types.js';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeFp(overrides: Partial<SchemaFingerprint> = {}): SchemaFingerprint {
  return {
    connectorId: 'test-connector',
    version: '1.0.0',
    capturedAt: '2024-01-01T00:00:00.000Z',
    fingerprint: 'abcd1234',
    endpoints: [],
    authHash: 'auth-hash',
    infoHash: 'info-hash',
    ...overrides,
  };
}

function makeReport(overrides: Partial<DriftReport> = {}): DriftReport {
  return {
    id: 'report-123',
    connectorId: 'test-connector',
    detectedAt: '2024-01-01T00:00:00.000Z',
    severity: 'major',
    baseline: makeFp({ fingerprint: 'old' }),
    current: makeFp({ fingerprint: 'new' }),
    changes: [
      {
        type: 'endpoint_removed',
        severity: 'critical',
        path: 'GET:/payments',
        description: 'Endpoint removed',
      },
    ],
    status: 'open',
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('EvidenceBuilder', () => {
  let tmpDir: string;
  let builder: EvidenceBuilder;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'evidence-test-'));
    builder = new EvidenceBuilder(tmpDir);
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('builds an evidence pack with required fields', async () => {
    const report = makeReport();
    const pack = await builder.build(report, []);

    expect(pack.id).toBeTruthy();
    expect(pack.connectorId).toBe('test-connector');
    expect(pack.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(pack.drift).toEqual(expect.objectContaining({ id: 'report-123' }));
    expect(pack.httpSamples).toHaveLength(0);
    expect(pack.tags).toContain('connector:test-connector');
    expect(pack.tags).toContain('severity:major');
  });

  it('stores drift types as tags', async () => {
    const report = makeReport({
      changes: [
        { type: 'endpoint_removed', severity: 'critical', description: 'test', path: '/x' },
        { type: 'auth_changed', severity: 'critical', description: 'test' },
        { type: 'endpoint_removed', severity: 'critical', description: 'test', path: '/y' }, // duplicate type
      ],
    });

    const pack = await builder.build(report, []);
    // Should de-duplicate drift types
    const driftTags = pack.tags.filter(t => t.startsWith('drift:'));
    const uniqueTypes = new Set(driftTags);
    expect(driftTags.length).toBe(uniqueTypes.size);
    expect(driftTags).toContain('drift:endpoint_removed');
    expect(driftTags).toContain('drift:auth_changed');
  });

  it('persists pack to disk and report gets evidence path', async () => {
    const report = makeReport();
    const pack = await builder.build(report, []);

    expect(report.evidencePackPath).toContain(pack.id);
    expect(report.evidencePackPath).toContain(tmpDir);
  });

  it('loads persisted pack from disk', async () => {
    const report = makeReport();
    const pack = await builder.build(report, []);

    const loaded = await builder.load(pack.id);
    expect(loaded).not.toBeNull();
    expect(loaded!.id).toBe(pack.id);
    expect(loaded!.connectorId).toBe('test-connector');
  });

  it('returns null when loading non-existent pack', async () => {
    const result = await builder.load('non-existent-id');
    expect(result).toBeNull();
  });

  it('limits http samples to maxSamples', async () => {
    const samples = Array.from({ length: 100 }, (_, i) =>
      EvidenceBuilder.createSample('GET', `https://api.io/${i}`, {}, null, 200, {}, {}, 100)
    );

    const report = makeReport();
    const pack = await builder.build(report, samples, undefined, undefined, 10);
    expect(pack.httpSamples).toHaveLength(10);
  });

  it('includes baseline and current specs', async () => {
    const baseline = { openapi: '3.0.0', info: { title: 'Old', version: '1.0.0' } };
    const current = { openapi: '3.1.0', info: { title: 'New', version: '2.0.0' } };

    const report = makeReport();
    const pack = await builder.build(report, [], baseline, current);
    expect(pack.baselineSpec).toEqual(baseline);
    expect(pack.currentSpec).toEqual(current);
  });

  it('stores correct connector version from current fingerprint', async () => {
    const report = makeReport({
      current: makeFp({ version: '3.5.2' }),
    });
    const pack = await builder.build(report, []);
    expect(pack.connectorVersion).toBe('3.5.2');
  });

  describe('createSample', () => {
    it('redacts sensitive authorization header', () => {
      const sample = EvidenceBuilder.createSample(
        'POST',
        'https://api.io/charges',
        { Authorization: 'Bearer secret-token', 'Content-Type': 'application/json' },
        { amount: 100 },
        201,
        { 'x-request-id': 'abc' },
        { id: 'ch_123' },
        123,
      );

      expect(sample.requestHeaders['Authorization']).toBe('[REDACTED]');
      expect(sample.requestHeaders['Content-Type']).toBe('application/json');
    });

    it('redacts x-api-key header', () => {
      const sample = EvidenceBuilder.createSample(
        'GET', 'https://api.io', { 'x-api-key': 'secret' }, null, 200, {}, {}, 50
      );
      expect(sample.requestHeaders['x-api-key']).toBe('[REDACTED]');
    });

    it('creates sample with correct timestamp format', () => {
      const sample = EvidenceBuilder.createSample('GET', 'https://api.io', {}, null, 200, {}, {}, 10);
      expect(sample.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(sample.method).toBe('GET');
      expect(sample.latencyMs).toBe(10);
    });

    it('uppercases method', () => {
      const sample = EvidenceBuilder.createSample('post', 'https://api.io', {}, null, 201, {}, {}, 10);
      expect(sample.method).toBe('POST');
    });
  });
});
