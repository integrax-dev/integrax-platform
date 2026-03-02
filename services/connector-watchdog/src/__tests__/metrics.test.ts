import { describe, it, expect, afterEach } from 'vitest';
import { MetricsCollector } from '../metrics.js';
import type { DriftReport, SchemaFingerprint } from '../types.js';

function makeFp(): SchemaFingerprint {
  return {
    connectorId: 'c',
    version: '1.0.0',
    capturedAt: new Date().toISOString(),
    fingerprint: 'abc',
    endpoints: [],
    authHash: 'a',
    infoHash: 'b',
  };
}

function makeReport(severity: DriftReport['severity']): DriftReport {
  return {
    id: 'r1',
    connectorId: 'test-connector',
    detectedAt: new Date().toISOString(),
    severity,
    baseline: makeFp(),
    current: makeFp(),
    changes: [],
    status: 'open',
  };
}

describe('MetricsCollector', () => {
  let collector: MetricsCollector;

  afterEach(async () => {
    await collector.stop();
  });

  it('starts with empty counters', () => {
    collector = new MetricsCollector();
    const snap = collector.snapshot();
    expect(Object.keys(snap.checksTotal)).toHaveLength(0);
    expect(Object.keys(snap.driftTotal)).toHaveLength(0);
    expect(Object.keys(snap.prsTotal)).toHaveLength(0);
  });

  it('records checks', () => {
    collector = new MetricsCollector();
    collector.recordCheck('connector-a');
    collector.recordCheck('connector-a');
    collector.recordCheck('connector-b');

    const snap = collector.snapshot();
    expect(snap.checksTotal['connector="connector-a"']).toBe(2);
    expect(snap.checksTotal['connector="connector-b"']).toBe(1);
  });

  it('records drift events by severity', () => {
    collector = new MetricsCollector();
    collector.recordDrift(makeReport('critical'));
    collector.recordDrift(makeReport('major'));
    collector.recordDrift(makeReport('critical'));

    const snap = collector.snapshot();
    expect(snap.driftTotal['connector="test-connector",severity="critical"']).toBe(2);
    expect(snap.driftTotal['connector="test-connector",severity="major"']).toBe(1);
  });

  it('does not record drift for severity=none', () => {
    collector = new MetricsCollector();
    collector.recordDrift(makeReport('none'));

    const snap = collector.snapshot();
    expect(Object.keys(snap.driftTotal)).toHaveLength(0);
  });

  it('records PR creations', () => {
    collector = new MetricsCollector();
    collector.recordPr('connector-a');
    collector.recordPr('connector-a');

    const snap = collector.snapshot();
    expect(snap.prsTotal['connector="connector-a"']).toBe(2);
  });

  it('updates lastCheck timestamp', () => {
    collector = new MetricsCollector();
    const before = Math.floor(Date.now() / 1000);
    collector.recordCheck('my-connector');
    const after = Math.floor(Date.now() / 1000);

    const snap = collector.snapshot();
    const ts = snap.lastCheck['connector="my-connector"'];
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });

  it('render() produces valid Prometheus text format', () => {
    collector = new MetricsCollector();
    collector.recordCheck('conn-a');
    collector.recordDrift(makeReport('major'));
    collector.recordPr('conn-a');

    const output = collector.render();

    expect(output).toContain('# HELP connector_drift_checks_total');
    expect(output).toContain('# TYPE connector_drift_checks_total counter');
    expect(output).toContain('connector_drift_checks_total');
    expect(output).toContain('connector_drift_detected_total');
    expect(output).toContain('connector_drift_prs_created_total');
    expect(output).toContain('connector_watchdog_last_check_timestamp');
    expect(output.endsWith('\n')).toBe(true);
  });

  it('render() with no data is still valid', () => {
    collector = new MetricsCollector();
    const output = collector.render();
    expect(output).toContain('# HELP');
    expect(output.endsWith('\n')).toBe(true);
  });
});
