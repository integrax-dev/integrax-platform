/**
 * connector-watchdog — Public API
 *
 * Exports all public components for use by other services and scripts.
 */

export { ConnectorWatchdog, createWatchdog } from './watchdog.js';
export { SchemaFingerprinter, getFingerprinter, canonicalise, sha256 } from './schema-fingerprinter.js';
export { DriftDetector, getDriftDetector } from './drift-detector.js';
export { EvidenceBuilder, createEvidenceBuilder } from './evidence-builder.js';
export { FingerprintStore, createFingerprintStore } from './fingerprint-store.js';
export { PrService, createPrService } from './pr-service.js';
export { MetricsCollector, getMetricsCollector } from './metrics.js';

export type {
  SchemaFingerprint,
  EndpointSignature,
  DriftReport,
  DriftChange,
  DriftSeverity,
  DriftType,
  EvidencePack,
  HttpSample,
  LearnedPattern,
  PullRequestPayload,
  PullRequestFile,
  PullRequestResult,
  WatchdogConfig,
  DriftMetrics,
} from './types.js';
