/**
 * Telemetry Agent
 *
 * Runs alongside a self-hosted IntegraX instance.
 * - Sends heartbeat to integrax.dev every 30 min
 * - Forwards logs (NDJSON from stdin or file tail) to ingest endpoint
 * - Never forwards tenant business data — only platform metrics + logs
 */

export interface AgentConfig {
  licenseKey: string;
  ingestUrl: string;           // https://api.integrax.dev/telemetry/ingest
  heartbeatUrl: string;        // https://api.integrax.dev/license/heartbeat
  heartbeatIntervalMs?: number; // default 30 min
  hostname?: string;
  version?: string;
  enabled?: boolean;
}

interface MetricBatch {
  licenseKey: string;
  hostname: string;
  version: string;
  timestamp: string;
  metrics: Record<string, number>;
  logs: LogEntry[];
}

interface LogEntry {
  level: string;
  msg: string;
  time: string;
  service?: string;
  [k: string]: unknown;
}

// Strip any field that might contain business data
const ALLOWED_LOG_FIELDS = new Set([
  'level', 'msg', 'time', 'service', 'version', 'hostname',
  'err', 'error', 'duration', 'durationMs', 'statusCode',
  'method', 'path', 'correlationId', 'eventType', 'jobId', 'attempt',
]);

function sanitizeLog(entry: Record<string, unknown>): LogEntry {
  const safe: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(entry)) {
    if (ALLOWED_LOG_FIELDS.has(k)) safe[k] = v;
  }
  // Never send tenantId, payloads, credentials
  return safe as LogEntry;
}

export class TelemetryAgent {
  private readonly cfg: Required<AgentConfig>;
  private heartbeatTimer?: ReturnType<typeof setInterval>;
  private readonly pendingLogs: LogEntry[] = [];
  private flushTimer?: ReturnType<typeof setInterval>;

  constructor(cfg: AgentConfig) {
    this.cfg = {
      heartbeatIntervalMs: 30 * 60 * 1000,
      hostname: process.env['HOSTNAME'] ?? 'self-hosted',
      version: process.env['npm_package_version'] ?? 'unknown',
      enabled: true,
      ...cfg,
    };
  }

  start(): void {
    if (!this.cfg.enabled) return;

    // Heartbeat
    void this.sendHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      void this.sendHeartbeat();
    }, this.cfg.heartbeatIntervalMs);

    // Flush logs every 60s
    this.flushTimer = setInterval(() => {
      void this.flush();
    }, 60_000);

    // Graceful shutdown
    process.on('SIGINT', () => { void this.stop(); });
    process.on('SIGTERM', () => { void this.stop(); });
  }

  async stop(): Promise<void> {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    if (this.flushTimer) clearInterval(this.flushTimer);
    await this.flush();
  }

  /** Call this from your log pipeline to forward log lines */
  ingestLogLine(raw: string): void {
    if (!this.cfg.enabled) return;
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const sanitized = sanitizeLog(parsed);
      // Only forward warnings, errors, and above
      const level = String(parsed['level'] ?? '').toLowerCase();
      if (!['warn', 'error', 'fatal', '40', '50', '60'].includes(level)) return;
      this.pendingLogs.push(sanitized);
      if (this.pendingLogs.length >= 100) void this.flush();
    } catch { /* skip non-JSON lines */ }
  }

  private async sendHeartbeat(): Promise<void> {
    try {
      await fetch(this.cfg.heartbeatUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          licenseKey: this.cfg.licenseKey,
          hostname: this.cfg.hostname,
          version: this.cfg.version,
          activeTenants: await this.getActiveTenantCount(),
          timestamp: new Date().toISOString(),
        }),
        signal: AbortSignal.timeout(10_000),
      });
    } catch { /* network errors must never crash the host process */ }
  }

  private async flush(): Promise<void> {
    if (this.pendingLogs.length === 0) return;
    const batch = this.pendingLogs.splice(0, this.pendingLogs.length);
    try {
      await fetch(this.cfg.ingestUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-License-Key': this.cfg.licenseKey,
        },
        body: JSON.stringify({
          licenseKey: this.cfg.licenseKey,
          hostname: this.cfg.hostname,
          version: this.cfg.version,
          timestamp: new Date().toISOString(),
          metrics: {},
          logs: batch,
        } satisfies MetricBatch),
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      // Re-queue — put back at front (up to 500 max to avoid unbounded growth)
      this.pendingLogs.unshift(...batch.slice(0, 500 - this.pendingLogs.length));
    }
  }

  private async getActiveTenantCount(): Promise<number> {
    // This is injected by the control-plane if TELEMETRY_COUNT_TENANTS=true
    return 0;
  }
}
