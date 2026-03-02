/**
 * Connector Watchdog — Main Orchestrator
 *
 * Ties together fingerprinting, drift detection, evidence building, PR creation,
 * and metrics. The primary entry point for scheduled and on-demand drift checks.
 *
 * Usage:
 *   const watchdog = new ConnectorWatchdog(config);
 *   await watchdog.check('mercadopago', fetchSpec('https://api.mercadopago.com/openapi.json'));
 */

import { SchemaFingerprinter } from './schema-fingerprinter.js';
import { DriftDetector } from './drift-detector.js';
import { EvidenceBuilder } from './evidence-builder.js';
import { FingerprintStore } from './fingerprint-store.js';
import { PrService } from './pr-service.js';
import { MetricsCollector } from './metrics.js';
import type {
  WatchdogConfig,
  DriftReport,
  EvidencePack,
  HttpSample,
  DriftSeverity,
} from './types.js';

// ─── Severity ordering ────────────────────────────────────────────────────────

const SEVERITY_RANK: Record<DriftSeverity, number> = {
  none: 0,
  minor: 1,
  major: 2,
  critical: 3,
};

function severityGte(a: DriftSeverity, b: DriftSeverity): boolean {
  return SEVERITY_RANK[a] >= SEVERITY_RANK[b];
}

// ─── ConnectorWatchdog ────────────────────────────────────────────────────────

export class ConnectorWatchdog {
  private readonly fingerprinter: SchemaFingerprinter;
  private readonly detector: DriftDetector;
  private readonly evidenceBuilder: EvidenceBuilder;
  private readonly store: FingerprintStore;
  private readonly prService: PrService | null;
  private readonly metrics: MetricsCollector;

  constructor(private readonly config: WatchdogConfig) {
    this.fingerprinter = new SchemaFingerprinter();
    this.detector = new DriftDetector();
    this.evidenceBuilder = new EvidenceBuilder(config.evidenceDir);
    this.store = new FingerprintStore(config.fingerprintDir);
    this.prService = config.github ? new PrService(config) : null;
    this.metrics = new MetricsCollector();

    if (config.metricsPort && config.metricsPort > 0) {
      this.metrics.startServer(config.metricsPort);
    }
  }

  /**
   * Run a drift check for a single connector.
   *
   * @param connectorId  Stable connector ID (e.g. 'mercadopago')
   * @param spec         Parsed OpenAPI spec (fetched fresh from the API)
   * @param httpSamples  Optional recent HTTP samples to include in evidence
   * @returns DriftReport — always (severity='none' if no drift)
   */
  async check(
    connectorId: string,
    spec: unknown,
    httpSamples: HttpSample[] = [],
  ): Promise<DriftReport> {
    this.metrics.recordCheck(connectorId);

    // 1. Compute fingerprint from current spec
    const currentFp = this.fingerprinter.fingerprint(connectorId, spec as Parameters<SchemaFingerprinter['fingerprint']>[1]);

    // 2. Load baseline (or set it if first run)
    const baseline = await this.store.getBaseline(connectorId);

    // 3. Save latest snapshot
    await this.store.save(currentFp);

    // If no baseline yet, this is the first run — no drift to report
    if (!baseline) {
      console.log(`[watchdog] First fingerprint captured for ${connectorId} — baseline established`);
      return {
        id: 'bootstrap',
        connectorId,
        detectedAt: new Date().toISOString(),
        severity: 'none',
        baseline: currentFp,
        current: currentFp,
        changes: [],
        status: 'resolved',
      };
    }

    // 4. Compare
    const report = this.detector.compare(baseline, currentFp);

    // 5. Record metrics
    this.metrics.recordDrift(report);

    // 6. Build evidence pack if drift is significant
    if (report.severity !== 'none') {
      console.warn(`[watchdog] Drift detected on ${connectorId} — severity=${report.severity}, changes=${report.changes.length}`);

      const pack = await this.evidenceBuilder.build(report, httpSamples);
      console.log(`[watchdog] Evidence pack created: ${pack.id}`);

      // 7. Create PR if threshold met
      if (
        this.prService &&
        severityGte(report.severity, this.config.prThreshold)
      ) {
        try {
          const pr = await this.prService.createDriftPr(report);
          if (pr) {
            report.prUrl = pr.url;
            this.metrics.recordPr(connectorId);
            console.log(`[watchdog] PR created: ${pr.url}`);
          }
        } catch (err) {
          console.error(`[watchdog] Failed to create PR: ${err}`);
        }
      }
    } else {
      console.log(`[watchdog] No drift detected for ${connectorId}`);
    }

    return report;
  }

  /**
   * Resolve a drift report — promotes the latest fingerprint to baseline.
   */
  async resolve(connectorId: string): Promise<void> {
    await this.store.promoteToBaseline(connectorId);
    console.log(`[watchdog] Resolved drift for ${connectorId}, new baseline established`);
  }

  /** Access metrics for testing or external exposure. */
  getMetrics(): MetricsCollector {
    return this.metrics;
  }

  /** Render Prometheus text format directly. */
  renderMetrics(): string {
    return this.metrics.render();
  }

  async shutdown(): Promise<void> {
    await this.metrics.stop();
  }
}

// ─── Factory ─────────────────────────────────────────────────────────────────

export function createWatchdog(config: WatchdogConfig): ConnectorWatchdog {
  return new ConnectorWatchdog(config);
}
