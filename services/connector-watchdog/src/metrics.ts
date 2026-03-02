/**
 * Prometheus Metrics for connector-watchdog
 *
 * Exposes metrics via an HTTP endpoint on configurable port.
 * Uses a hand-rolled Prometheus text format to avoid adding prom-client dependency.
 *
 * Metrics exposed:
 *  connector_drift_checks_total{connector}
 *  connector_drift_detected_total{connector,severity}
 *  connector_drift_prs_created_total{connector}
 *  connector_watchdog_last_check_timestamp{connector}
 */

import { createServer, type Server } from 'node:http';
import type { DriftReport } from './types.js';

// ─── Counter types ────────────────────────────────────────────────────────────

interface LabeledCounter {
  [labels: string]: number;
}

// ─── MetricsCollector ─────────────────────────────────────────────────────────

export class MetricsCollector {
  private checksTotal: LabeledCounter = {};
  private driftTotal: LabeledCounter = {};
  private prsTotal: LabeledCounter = {};
  private lastCheck: LabeledCounter = {};

  private server: Server | null = null;

  // ─── Record events ────────────────────────────────────────────────────────

  recordCheck(connectorId: string): void {
    const key = `connector="${connectorId}"`;
    this.checksTotal[key] = (this.checksTotal[key] ?? 0) + 1;
    this.lastCheck[key] = Math.floor(Date.now() / 1000);
  }

  recordDrift(report: DriftReport): void {
    if (report.severity === 'none') return;
    const key = `connector="${report.connectorId}",severity="${report.severity}"`;
    this.driftTotal[key] = (this.driftTotal[key] ?? 0) + 1;
  }

  recordPr(connectorId: string): void {
    const key = `connector="${connectorId}"`;
    this.prsTotal[key] = (this.prsTotal[key] ?? 0) + 1;
  }

  // ─── Prometheus text format ───────────────────────────────────────────────

  render(): string {
    const lines: string[] = [];

    lines.push('# HELP connector_drift_checks_total Total drift checks performed per connector');
    lines.push('# TYPE connector_drift_checks_total counter');
    for (const [labels, val] of Object.entries(this.checksTotal)) {
      lines.push(`connector_drift_checks_total{${labels}} ${val}`);
    }

    lines.push('# HELP connector_drift_detected_total Total drift events detected per connector/severity');
    lines.push('# TYPE connector_drift_detected_total counter');
    for (const [labels, val] of Object.entries(this.driftTotal)) {
      lines.push(`connector_drift_detected_total{${labels}} ${val}`);
    }

    lines.push('# HELP connector_drift_prs_created_total Total PRs created per connector');
    lines.push('# TYPE connector_drift_prs_created_total counter');
    for (const [labels, val] of Object.entries(this.prsTotal)) {
      lines.push(`connector_drift_prs_created_total{${labels}} ${val}`);
    }

    lines.push('# HELP connector_watchdog_last_check_timestamp Unix timestamp of last drift check');
    lines.push('# TYPE connector_watchdog_last_check_timestamp gauge');
    for (const [labels, val] of Object.entries(this.lastCheck)) {
      lines.push(`connector_watchdog_last_check_timestamp{${labels}} ${val}`);
    }

    return lines.join('\n') + '\n';
  }

  // ─── HTTP server ──────────────────────────────────────────────────────────

  /**
   * Start an HTTP server exposing /metrics endpoint on the given port.
   */
  startServer(port: number): void {
    if (port === 0) return;

    this.server = createServer((req, res) => {
      if (req.url === '/metrics' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'text/plain; version=0.0.4; charset=utf-8' });
        res.end(this.render());
      } else if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok' }));
      } else {
        res.writeHead(404);
        res.end('Not Found');
      }
    });

    this.server.listen(port, () => {
      console.log(`[watchdog/metrics] Prometheus metrics on :${port}/metrics`);
    });
  }

  /** Stop the metrics server gracefully. */
  async stop(): Promise<void> {
    if (!this.server) return;
    await new Promise<void>((resolve, reject) =>
      this.server!.close(err => (err ? reject(err) : resolve()))
    );
    this.server = null;
  }

  /** Snapshot current state (for testing). */
  snapshot(): Record<string, LabeledCounter> {
    return {
      checksTotal: { ...this.checksTotal },
      driftTotal: { ...this.driftTotal },
      prsTotal: { ...this.prsTotal },
      lastCheck: { ...this.lastCheck },
    };
  }
}

// ─── Singleton ────────────────────────────────────────────────────────────────

let _collector: MetricsCollector | null = null;

export function getMetricsCollector(): MetricsCollector {
  if (!_collector) _collector = new MetricsCollector();
  return _collector;
}
