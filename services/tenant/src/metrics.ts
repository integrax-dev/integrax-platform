/**
 * Metrics and Alerts per tenant
 *
 * Integrates with Prometheus for metrics collection.
 * Falls back to in-memory for development.
 */
import {
  Counter,
  Gauge,
  Histogram,
  Registry,
  collectDefaultMetrics,
} from 'prom-client';

// Create a dedicated registry for tenant metrics
const registry = new Registry();

// Collect default Node.js metrics
collectDefaultMetrics({ register: registry, prefix: 'integrax_' });

// ============================================
// Metrics Definitions
// ============================================

// Event metrics
const eventsTotal = new Counter({
  name: 'integrax_tenant_events_total',
  help: 'Total number of events processed per tenant',
  labelNames: ['tenant_id', 'event_type', 'status'],
  registers: [registry],
});

const eventLatency = new Histogram({
  name: 'integrax_tenant_event_latency_seconds',
  help: 'Event processing latency in seconds',
  labelNames: ['tenant_id', 'event_type'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5, 10],
  registers: [registry],
});

// Workflow metrics
const workflowsTotal = new Counter({
  name: 'integrax_tenant_workflows_total',
  help: 'Total number of workflows executed per tenant',
  labelNames: ['tenant_id', 'workflow_type', 'status'],
  registers: [registry],
});

const workflowDuration = new Histogram({
  name: 'integrax_tenant_workflow_duration_seconds',
  help: 'Workflow execution duration in seconds',
  labelNames: ['tenant_id', 'workflow_type'],
  buckets: [0.1, 0.5, 1, 5, 10, 30, 60, 120, 300],
  registers: [registry],
});

const activeWorkflows = new Gauge({
  name: 'integrax_tenant_active_workflows',
  help: 'Number of currently active workflows per tenant',
  labelNames: ['tenant_id', 'workflow_type'],
  registers: [registry],
});

// Connector metrics
const connectorCallsTotal = new Counter({
  name: 'integrax_tenant_connector_calls_total',
  help: 'Total number of connector calls per tenant',
  labelNames: ['tenant_id', 'connector', 'operation', 'status'],
  registers: [registry],
});

const connectorLatency = new Histogram({
  name: 'integrax_tenant_connector_latency_seconds',
  help: 'Connector call latency in seconds',
  labelNames: ['tenant_id', 'connector', 'operation'],
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [registry],
});

// Rate limiting metrics
const rateLimitHits = new Counter({
  name: 'integrax_tenant_rate_limit_hits_total',
  help: 'Number of rate limit hits per tenant',
  labelNames: ['tenant_id'],
  registers: [registry],
});

// DLQ metrics
const dlqSize = new Gauge({
  name: 'integrax_tenant_dlq_size',
  help: 'Current DLQ size per tenant',
  labelNames: ['tenant_id'],
  registers: [registry],
});

// Usage metrics
const apiRequestsTotal = new Counter({
  name: 'integrax_tenant_api_requests_total',
  help: 'Total API requests per tenant',
  labelNames: ['tenant_id', 'method', 'path', 'status'],
  registers: [registry],
});

// ============================================
// Public Types
// ============================================

export interface TenantMetrics {
  tenantId: string;
  events: number;
  successes: number;
  failures: number;
  latencyAvg: number;
  queueSize: number;
}

// In-memory aggregation for quick access
const metricsCache: Map<string, TenantMetrics> = new Map();

// ============================================
// Recording Functions
// ============================================

/**
 * Record an event processing result
 */
export function recordEvent(
  tenantId: string,
  eventType: string,
  success: boolean,
  latencyMs: number
): void {
  const status = success ? 'success' : 'failure';
  eventsTotal.inc({ tenant_id: tenantId, event_type: eventType, status });
  eventLatency.observe(
    { tenant_id: tenantId, event_type: eventType },
    latencyMs / 1000
  );

  // Update cache
  updateMetricsCache(tenantId, success, latencyMs);
}

/**
 * Record a workflow execution
 */
export function recordWorkflow(
  tenantId: string,
  workflowType: string,
  status: 'started' | 'completed' | 'failed',
  durationMs?: number
): void {
  if (status === 'started') {
    activeWorkflows.inc({ tenant_id: tenantId, workflow_type: workflowType });
  } else {
    activeWorkflows.dec({ tenant_id: tenantId, workflow_type: workflowType });
    workflowsTotal.inc({ tenant_id: tenantId, workflow_type: workflowType, status });

    if (durationMs !== undefined) {
      workflowDuration.observe(
        { tenant_id: tenantId, workflow_type: workflowType },
        durationMs / 1000
      );
    }
  }
}

/**
 * Record a connector call
 */
export function recordConnectorCall(
  tenantId: string,
  connector: string,
  operation: string,
  success: boolean,
  latencyMs: number
): void {
  const status = success ? 'success' : 'failure';
  connectorCallsTotal.inc({
    tenant_id: tenantId,
    connector,
    operation,
    status,
  });
  connectorLatency.observe(
    { tenant_id: tenantId, connector, operation },
    latencyMs / 1000
  );
}

/**
 * Record a rate limit hit
 */
export function recordRateLimitHit(tenantId: string): void {
  rateLimitHits.inc({ tenant_id: tenantId });
}

/**
 * Update DLQ size
 */
export function updateDLQSize(tenantId: string, size: number): void {
  dlqSize.set({ tenant_id: tenantId }, size);
}

/**
 * Record an API request
 */
export function recordApiRequest(
  tenantId: string,
  method: string,
  path: string,
  statusCode: number
): void {
  apiRequestsTotal.inc({
    tenant_id: tenantId,
    method,
    path: normalizePath(path),
    status: String(statusCode),
  });
}

// ============================================
// Query Functions
// ============================================

/**
 * Get metrics for a specific tenant (legacy API compatibility)
 */
export function getMetrics(tenantId: string): TenantMetrics | undefined {
  return metricsCache.get(tenantId);
}

/**
 * Get all tenant metrics
 */
export function getAllMetrics(): TenantMetrics[] {
  return Array.from(metricsCache.values());
}

/**
 * Get Prometheus metrics output
 */
export async function getPrometheusMetrics(): Promise<string> {
  return registry.metrics();
}

/**
 * Get metrics registry (for Express middleware)
 */
export function getRegistry(): Registry {
  return registry;
}

// ============================================
// Helper Functions
// ============================================

function updateMetricsCache(
  tenantId: string,
  success: boolean,
  latencyMs: number
): void {
  let metrics = metricsCache.get(tenantId);

  if (!metrics) {
    metrics = {
      tenantId,
      events: 0,
      successes: 0,
      failures: 0,
      latencyAvg: 0,
      queueSize: 0,
    };
  }

  metrics.events++;
  if (success) {
    metrics.successes++;
  } else {
    metrics.failures++;
  }

  // Calculate running average
  metrics.latencyAvg =
    (metrics.latencyAvg * (metrics.events - 1) + latencyMs) / metrics.events;

  metricsCache.set(tenantId, metrics);
}

function normalizePath(path: string): string {
  // Replace dynamic segments with placeholders
  return path
    .replace(/\/[a-f0-9-]{36}/gi, '/:id') // UUIDs
    .replace(/\/\d+/g, '/:id') // Numeric IDs
    .replace(/\/ten_[a-z0-9]+/gi, '/:tenantId') // Tenant IDs
    .replace(/\/evt_[a-z0-9]+/gi, '/:eventId') // Event IDs
    .replace(/\/wf_[a-z0-9]+/gi, '/:workflowId'); // Workflow IDs
}

/**
 * Reset metrics for a tenant (useful for testing)
 */
export function resetTenantMetrics(tenantId: string): void {
  metricsCache.delete(tenantId);
}

/**
 * Express middleware for automatic request metrics
 */
export function metricsMiddleware() {
  return (
    req: { method: string; path: string; tenantId?: string },
    res: { statusCode: number; on: (event: string, cb: () => void) => void },
    next: () => void
  ) => {
    const start = Date.now();

    res.on('finish', () => {
      const tenantId = req.tenantId || 'unknown';
      const latency = Date.now() - start;

      recordApiRequest(tenantId, req.method, req.path, res.statusCode);

      // Also record as event for aggregate metrics
      const success = res.statusCode < 400;
      recordEvent(tenantId, `api.${req.method.toLowerCase()}`, success, latency);
    });

    next();
  };
}
