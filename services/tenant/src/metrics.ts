// Métricas y alertas por tenant (mock)

export type TenantMetrics = {
  tenantId: string;
  events: number;
  successes: number;
  failures: number;
  latencyAvg: number;
  queueSize: number;
};

const metrics: Record<string, TenantMetrics> = {};

export function recordEvent(tenantId: string, success: boolean, latency: number) {
  if (!metrics[tenantId]) {
    metrics[tenantId] = {
      tenantId,
      events: 0,
      successes: 0,
      failures: 0,
      latencyAvg: 0,
      queueSize: 0,
    };
  }
  const m = metrics[tenantId];
  m.events++;
  if (success) m.successes++;
  else m.failures++;
  m.latencyAvg = (m.latencyAvg * (m.events - 1) + latency) / m.events;
}

export function getMetrics(tenantId: string): TenantMetrics | undefined {
  return metrics[tenantId];
}
