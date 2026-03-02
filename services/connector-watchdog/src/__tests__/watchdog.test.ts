import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ConnectorWatchdog } from '../watchdog.js';
import type { WatchdogConfig } from '../types.js';

// ─── Test spec fixtures ───────────────────────────────────────────────────────

const SPEC_V1 = {
  info: { title: 'Test API', version: '1.0.0' },
  servers: [{ url: 'https://api.example.com/v1' }],
  paths: {
    '/orders': {
      get: {
        parameters: [{ name: 'status', in: 'query', schema: { type: 'string' } }],
        responses: { '200': { content: { 'application/json': { schema: { type: 'array' } } } } },
      },
      post: {
        requestBody: {
          content: { 'application/json': { schema: { type: 'object', properties: { item: { type: 'string' } } } } },
        },
        responses: { '201': { content: { 'application/json': { schema: { type: 'object' } } } } },
      },
    },
  },
  components: { securitySchemes: { apiKey: { type: 'apiKey', in: 'header', name: 'X-Key' } } },
  security: [{ apiKey: [] }],
};

const SPEC_V2_BREAKING = (() => {
  const s = JSON.parse(JSON.stringify(SPEC_V1));
  delete s.paths['/orders']; // remove endpoint — critical
  return s;
})();

const SPEC_V2_MINOR = (() => {
  const s = JSON.parse(JSON.stringify(SPEC_V1));
  s.paths['/shipments'] = { get: { responses: { '200': {} } } }; // add endpoint — minor
  return s;
})();

// ─── Setup ────────────────────────────────────────────────────────────────────

async function makeWatchdog(overrides?: Partial<WatchdogConfig>): Promise<{
  watchdog: ConnectorWatchdog;
  tmpDir: string;
}> {
  const tmpDir = await mkdtemp(join(tmpdir(), 'watchdog-test-'));
  const config: WatchdogConfig = {
    fingerprintDir: join(tmpDir, 'fingerprints'),
    evidenceDir: join(tmpDir, 'evidence'),
    prThreshold: 'major',
    metricsPort: 0, // disabled
    ...overrides,
  };
  const watchdog = new ConnectorWatchdog(config);
  return { watchdog, tmpDir };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ConnectorWatchdog', () => {
  let tmpDir: string;
  let watchdog: ConnectorWatchdog;

  beforeEach(async () => {
    const result = await makeWatchdog();
    watchdog = result.watchdog;
    tmpDir = result.tmpDir;
  });

  afterEach(async () => {
    await watchdog.shutdown();
    await rm(tmpDir, { recursive: true, force: true });
  });

  // ─── First run ────────────────────────────────────────────────────────────

  it('first run establishes baseline and returns severity=none', async () => {
    const report = await watchdog.check('my-connector', SPEC_V1);

    expect(report.severity).toBe('none');
    expect(report.id).toBe('bootstrap');
    expect(report.changes).toHaveLength(0);
  });

  it('second run with identical spec returns no drift', async () => {
    await watchdog.check('my-connector', SPEC_V1); // bootstrap
    const report = await watchdog.check('my-connector', SPEC_V1);

    expect(report.severity).toBe('none');
    expect(report.changes).toHaveLength(0);
  });

  // ─── Drift detection ──────────────────────────────────────────────────────

  it('detects critical drift on breaking change', async () => {
    await watchdog.check('my-connector', SPEC_V1); // baseline
    const report = await watchdog.check('my-connector', SPEC_V2_BREAKING);

    expect(report.severity).toBe('critical');
    expect(report.changes.length).toBeGreaterThan(0);
    expect(report.status).toBe('open');
  });

  it('detects minor drift on additive change', async () => {
    await watchdog.check('my-connector', SPEC_V1);
    const report = await watchdog.check('my-connector', SPEC_V2_MINOR);

    expect(report.severity).toBe('minor');
    expect(report.changes.some(c => c.type === 'endpoint_added')).toBe(true);
  });

  it('builds evidence pack for non-trivial drift', async () => {
    await watchdog.check('my-connector', SPEC_V1);
    const report = await watchdog.check('my-connector', SPEC_V2_BREAKING);

    expect(report.evidencePackPath).toBeTruthy();
    expect(report.evidencePackPath).toContain(tmpDir);
  });

  // ─── Resolve ──────────────────────────────────────────────────────────────

  it('resolve() promotes latest to baseline, subsequent check has no drift', async () => {
    await watchdog.check('my-connector', SPEC_V1);
    await watchdog.check('my-connector', SPEC_V2_MINOR); // drift detected

    await watchdog.resolve('my-connector'); // accept the new schema

    const report = await watchdog.check('my-connector', SPEC_V2_MINOR); // no drift now
    expect(report.severity).toBe('none');
  });

  // ─── Metrics ──────────────────────────────────────────────────────────────

  it('records checks in metrics', async () => {
    await watchdog.check('conn-a', SPEC_V1);
    await watchdog.check('conn-a', SPEC_V1);

    const snap = watchdog.getMetrics().snapshot();
    expect(snap.checksTotal['connector="conn-a"']).toBe(2);
  });

  it('records drift events in metrics', async () => {
    await watchdog.check('conn-a', SPEC_V1);
    await watchdog.check('conn-a', SPEC_V2_BREAKING);

    const snap = watchdog.getMetrics().snapshot();
    const driftKey = Object.keys(snap.driftTotal).find(k => k.includes('conn-a'));
    expect(driftKey).toBeTruthy();
    expect(snap.driftTotal[driftKey!]).toBeGreaterThan(0);
  });

  it('renderMetrics() returns Prometheus text', async () => {
    await watchdog.check('conn-a', SPEC_V1);
    const metrics = watchdog.renderMetrics();
    expect(metrics).toContain('connector_drift_checks_total');
  });

  // ─── Multiple connectors ──────────────────────────────────────────────────

  it('tracks multiple connectors independently', async () => {
    await watchdog.check('connector-a', SPEC_V1);
    await watchdog.check('connector-b', SPEC_V1);

    const reportA = await watchdog.check('connector-a', SPEC_V2_BREAKING);
    const reportB = await watchdog.check('connector-b', SPEC_V1); // no drift

    expect(reportA.severity).toBe('critical');
    expect(reportB.severity).toBe('none');
  });

  // ─── PR service skipped without config ────────────────────────────────────

  it('does not create PR when github config is absent', async () => {
    await watchdog.check('my-connector', SPEC_V1);
    const report = await watchdog.check('my-connector', SPEC_V2_BREAKING);

    // No prUrl because no github config was provided
    expect(report.prUrl).toBeUndefined();
  });
});
