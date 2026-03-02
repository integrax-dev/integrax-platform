/**
 * Connector Watchdog — Types
 *
 * Shared types for schema fingerprinting, drift detection, evidence packs, and PR automation.
 */

// ─── Schema Fingerprinting ────────────────────────────────────────────────────

export interface EndpointSignature {
  method: string;
  path: string;
  /** Sorted, stable hash of parameter names+types */
  paramsHash: string;
  /** Sorted, stable hash of request body schema */
  requestHash: string;
  /** Sorted, stable hash of response schemas */
  responseHash: string;
  /** Auth scheme if endpoint-specific */
  authScheme?: string;
}

export interface SchemaFingerprint {
  connectorId: string;
  version: string;
  capturedAt: string;
  /** Top-level SHA-256 of all endpoint signatures */
  fingerprint: string;
  endpoints: EndpointSignature[];
  /** Hash of global auth schemes */
  authHash: string;
  /** Hash of top-level info (baseUrl, title, version) */
  infoHash: string;
}

// ─── Drift Detection ──────────────────────────────────────────────────────────

export type DriftSeverity = 'critical' | 'major' | 'minor' | 'none';
export type DriftType =
  | 'endpoint_removed'
  | 'endpoint_added'
  | 'param_changed'
  | 'response_schema_changed'
  | 'auth_changed'
  | 'base_url_changed'
  | 'version_changed';

export interface DriftChange {
  type: DriftType;
  severity: DriftSeverity;
  path?: string;
  description: string;
  baseline?: unknown;
  current?: unknown;
}

export interface DriftReport {
  id: string;
  connectorId: string;
  detectedAt: string;
  severity: DriftSeverity;
  baseline: SchemaFingerprint;
  current: SchemaFingerprint;
  changes: DriftChange[];
  evidencePackPath?: string;
  status: 'open' | 'investigating' | 'resolved' | 'dismissed';
  prUrl?: string;
}

// ─── Evidence Pack ────────────────────────────────────────────────────────────

export interface HttpSample {
  timestamp: string;
  method: string;
  url: string;
  requestHeaders: Record<string, string>;
  requestBody?: unknown;
  responseStatus: number;
  responseHeaders: Record<string, string>;
  responseBody?: unknown;
  latencyMs: number;
  error?: string;
}

export interface EvidencePack {
  id: string;
  connectorId: string;
  createdAt: string;
  drift: DriftReport;
  httpSamples: HttpSample[];
  baselineSpec?: unknown;
  currentSpec?: unknown;
  connectorVersion: string;
  environment: 'production' | 'staging' | 'testing';
  tags: string[];
}

// ─── Auto-learning ────────────────────────────────────────────────────────────

export interface LearnedPattern {
  id: string;
  connectorId: string;
  driftType: DriftType;
  pattern: string;
  resolution: string;
  confirmedAt: string;
  confidence: number;
}

// ─── PR Automation ────────────────────────────────────────────────────────────

export interface PullRequestPayload {
  title: string;
  body: string;
  branch: string;
  baseBranch: string;
  files: PullRequestFile[];
  labels: string[];
  assignees: string[];
}

export interface PullRequestFile {
  path: string;
  content: string;
  encoding?: 'utf-8' | 'base64';
}

export interface PullRequestResult {
  url: string;
  number: number;
  branch: string;
  createdAt: string;
}

// ─── Watchdog Config ──────────────────────────────────────────────────────────

export interface WatchdogConfig {
  /** Directory to store fingerprint snapshots */
  fingerprintDir: string;
  /** Directory to store evidence packs */
  evidenceDir: string;
  /** Severity threshold to trigger a PR (defaults to 'major') */
  prThreshold: DriftSeverity;
  /** GitHub config for PR automation */
  github?: {
    owner: string;
    repo: string;
    token: string;
    defaultBaseBranch: string;
    defaultAssignees: string[];
    defaultLabels: string[];
  };
  /** Prometheus metrics port (0 = disabled) */
  metricsPort?: number;
}

// ─── Metrics ─────────────────────────────────────────────────────────────────

export interface DriftMetrics {
  total_drift_checks: number;
  drift_detected_total: number;
  drift_by_severity: Record<DriftSeverity, number>;
  drift_by_connector: Record<string, number>;
  last_check_timestamp: number;
  prs_created_total: number;
}
