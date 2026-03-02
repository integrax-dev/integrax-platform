/**
 * Drift Detector
 *
 * Compares two SchemaFingerprints and produces a structured DriftReport with
 * typed change entries and severity classification.
 *
 * Severity rules:
 *  critical  — endpoint removed, auth changed, base URL changed
 *  major     — response schema changed, request schema changed, param added/removed
 *  minor     — endpoint added, version string changed
 *  none      — identical fingerprints
 */

import { randomUUID } from 'node:crypto';
import type {
  SchemaFingerprint,
  EndpointSignature,
  DriftReport,
  DriftChange,
  DriftSeverity,
  DriftType,
} from './types.js';

// ─── Severity helpers ─────────────────────────────────────────────────────────

const SEVERITY_ORDER: DriftSeverity[] = ['none', 'minor', 'major', 'critical'];

function maxSeverity(...severities: DriftSeverity[]): DriftSeverity {
  let max = 0;
  for (const s of severities) {
    const idx = SEVERITY_ORDER.indexOf(s);
    if (idx > max) max = idx;
  }
  return SEVERITY_ORDER[max];
}

// ─── Drift Detector ───────────────────────────────────────────────────────────

export class DriftDetector {
  /**
   * Compare two fingerprints and return a DriftReport.
   * If fingerprints are identical, report has severity='none' and empty changes.
   */
  compare(baseline: SchemaFingerprint, current: SchemaFingerprint): DriftReport {
    const changes: DriftChange[] = [];

    // Fast path: identical fingerprint
    if (baseline.fingerprint === current.fingerprint) {
      return this.buildReport(baseline, current, [], 'none');
    }

    // Info-level changes
    if (baseline.infoHash !== current.infoHash) {
      changes.push(...this.compareInfo(baseline, current));
    }

    // Auth changes
    if (baseline.authHash !== current.authHash) {
      changes.push({
        type: 'auth_changed',
        severity: 'critical',
        description: 'Global authentication scheme has changed',
        baseline: baseline.authHash,
        current: current.authHash,
      });
    }

    // Endpoint-level changes
    changes.push(...this.compareEndpoints(baseline.endpoints, current.endpoints));

    const severity = changes.length === 0
      ? 'none'
      : maxSeverity(...changes.map(c => c.severity));

    return this.buildReport(baseline, current, changes, severity);
  }

  // ─── Private helpers ─────────────────────────────────────────────────────────

  private compareInfo(baseline: SchemaFingerprint, current: SchemaFingerprint): DriftChange[] {
    // Version string changed is minor; we infer base URL changed from infoHash
    const changes: DriftChange[] = [];

    if (baseline.version !== current.version) {
      changes.push({
        type: 'version_changed',
        severity: 'minor',
        description: `API version changed: ${baseline.version} → ${current.version}`,
        baseline: baseline.version,
        current: current.version,
      });
    }

    // We can't know the exact URL from the fingerprint alone; flag as major
    if (baseline.infoHash !== current.infoHash && baseline.version === current.version) {
      changes.push({
        type: 'base_url_changed',
        severity: 'critical',
        description: 'API base URL or title has changed (infoHash mismatch)',
        baseline: baseline.infoHash,
        current: current.infoHash,
      });
    }

    return changes;
  }

  private compareEndpoints(
    baseline: EndpointSignature[],
    current: EndpointSignature[],
  ): DriftChange[] {
    const changes: DriftChange[] = [];

    const baselineMap = new Map(baseline.map(e => [`${e.method}:${e.path}`, e]));
    const currentMap = new Map(current.map(e => [`${e.method}:${e.path}`, e]));

    // Removed endpoints
    for (const [key, baseEp] of baselineMap) {
      if (!currentMap.has(key)) {
        changes.push({
          type: 'endpoint_removed',
          severity: 'critical',
          path: key,
          description: `Endpoint removed: ${key}`,
          baseline: baseEp,
          current: undefined,
        });
      }
    }

    // Added endpoints
    for (const [key, curEp] of currentMap) {
      if (!baselineMap.has(key)) {
        changes.push({
          type: 'endpoint_added',
          severity: 'minor',
          path: key,
          description: `New endpoint added: ${key}`,
          baseline: undefined,
          current: curEp,
        });
      }
    }

    // Modified endpoints
    for (const [key, curEp] of currentMap) {
      const baseEp = baselineMap.get(key);
      if (!baseEp) continue; // already handled as 'added'

      changes.push(...this.compareEndpoint(key, baseEp, curEp));
    }

    return changes;
  }

  private compareEndpoint(
    key: string,
    base: EndpointSignature,
    cur: EndpointSignature,
  ): DriftChange[] {
    const changes: DriftChange[] = [];

    if (base.paramsHash !== cur.paramsHash) {
      changes.push({
        type: 'param_changed',
        severity: 'major',
        path: key,
        description: `Parameters changed on ${key}`,
        baseline: base.paramsHash,
        current: cur.paramsHash,
      });
    }

    if (base.requestHash !== cur.requestHash) {
      changes.push({
        type: 'param_changed',
        severity: 'major',
        path: key,
        description: `Request body schema changed on ${key}`,
        baseline: base.requestHash,
        current: cur.requestHash,
      });
    }

    if (base.responseHash !== cur.responseHash) {
      changes.push({
        type: 'response_schema_changed',
        severity: 'major',
        path: key,
        description: `Response schema changed on ${key}`,
        baseline: base.responseHash,
        current: cur.responseHash,
      });
    }

    if (base.authScheme !== cur.authScheme) {
      changes.push({
        type: 'auth_changed',
        severity: 'critical',
        path: key,
        description: `Auth scheme changed on ${key}`,
        baseline: base.authScheme,
        current: cur.authScheme,
      });
    }

    return changes;
  }

  private buildReport(
    baseline: SchemaFingerprint,
    current: SchemaFingerprint,
    changes: DriftChange[],
    severity: DriftSeverity,
  ): DriftReport {
    return {
      id: randomUUID(),
      connectorId: baseline.connectorId,
      detectedAt: new Date().toISOString(),
      severity,
      baseline,
      current,
      changes,
      status: severity === 'none' ? 'resolved' : 'open',
    };
  }
}

// ─── Singleton factory ────────────────────────────────────────────────────────

let _instance: DriftDetector | null = null;

export function getDriftDetector(): DriftDetector {
  if (!_instance) _instance = new DriftDetector();
  return _instance;
}
