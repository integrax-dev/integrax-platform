/**
 * @integrax/metrics
 *
 * Prometheus metrics collection for IntegraX platform.
 */

import {
  Registry,
  Counter,
  Histogram,
  Gauge,
  collectDefaultMetrics,
  register as globalRegister,
} from 'prom-client';

// Create a custom registry for IntegraX metrics
const registry = new Registry();

// Collect default Node.js metrics
collectDefaultMetrics({ register: registry });

// ============================================
// HTTP Metrics
// ============================================

export const httpRequestsTotal = new Counter({
  name: 'integrax_http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'path', 'status', 'tenant_id'] as const,
  registers: [registry],
});

export const httpRequestDuration = new Histogram({
  name: 'integrax_http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'path', 'status', 'tenant_id'] as const,
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [registry],
});

// ============================================
// Workflow Metrics
// ============================================

export const workflowsStarted = new Counter({
  name: 'integrax_workflows_started_total',
  help: 'Total number of workflows started',
  labelNames: ['tenant_id', 'workflow_type'] as const,
  registers: [registry],
});

export const workflowsCompleted = new Counter({
  name: 'integrax_workflows_completed_total',
  help: 'Total number of workflows completed',
  labelNames: ['tenant_id', 'workflow_type', 'status'] as const,
  registers: [registry],
});

export const workflowDuration = new Histogram({
  name: 'integrax_workflow_duration_seconds',
  help: 'Workflow execution duration in seconds',
  labelNames: ['tenant_id', 'workflow_type'] as const,
  buckets: [0.1, 0.5, 1, 5, 10, 30, 60, 120, 300, 600],
  registers: [registry],
});

export const workflowsActive = new Gauge({
  name: 'integrax_workflows_active',
  help: 'Number of currently active workflows',
  labelNames: ['tenant_id', 'workflow_type'] as const,
  registers: [registry],
});

// ============================================
// Connector Metrics
// ============================================

export const connectorCallsTotal = new Counter({
  name: 'integrax_connector_calls_total',
  help: 'Total number of connector calls',
  labelNames: ['tenant_id', 'connector_id', 'operation', 'status'] as const,
  registers: [registry],
});

export const connectorCallDuration = new Histogram({
  name: 'integrax_connector_call_duration_seconds',
  help: 'Connector call duration in seconds',
  labelNames: ['tenant_id', 'connector_id', 'operation'] as const,
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [registry],
});

export const connectorErrors = new Counter({
  name: 'integrax_connector_errors_total',
  help: 'Total number of connector errors',
  labelNames: ['tenant_id', 'connector_id', 'error_type'] as const,
  registers: [registry],
});

// ============================================
// Event Metrics
// ============================================

export const eventsReceived = new Counter({
  name: 'integrax_events_received_total',
  help: 'Total number of events received',
  labelNames: ['tenant_id', 'event_type', 'source'] as const,
  registers: [registry],
});

export const eventsProcessed = new Counter({
  name: 'integrax_events_processed_total',
  help: 'Total number of events processed',
  labelNames: ['tenant_id', 'event_type', 'status'] as const,
  registers: [registry],
});

export const eventProcessingDuration = new Histogram({
  name: 'integrax_event_processing_duration_seconds',
  help: 'Event processing duration in seconds',
  labelNames: ['tenant_id', 'event_type'] as const,
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [registry],
});

export const dlqSize = new Gauge({
  name: 'integrax_dlq_size',
  help: 'Number of events in Dead Letter Queue',
  labelNames: ['tenant_id'] as const,
  registers: [registry],
});

// ============================================
// Tenant Metrics
// ============================================

export const tenantsActive = new Gauge({
  name: 'integrax_tenants_active',
  help: 'Number of active tenants',
  registers: [registry],
});

export const tenantApiCalls = new Counter({
  name: 'integrax_tenant_api_calls_total',
  help: 'Total API calls per tenant',
  labelNames: ['tenant_id', 'endpoint'] as const,
  registers: [registry],
});

export const tenantRateLimitHits = new Counter({
  name: 'integrax_tenant_rate_limit_hits_total',
  help: 'Number of rate limit hits per tenant',
  labelNames: ['tenant_id'] as const,
  registers: [registry],
});

export const tenantQuotaUsage = new Gauge({
  name: 'integrax_tenant_quota_usage_percent',
  help: 'Tenant quota usage percentage',
  labelNames: ['tenant_id', 'quota_type'] as const,
  registers: [registry],
});

// ============================================
// LLM Metrics
// ============================================

export const llmRequestsTotal = new Counter({
  name: 'integrax_llm_requests_total',
  help: 'Total LLM API requests',
  labelNames: ['tenant_id', 'model', 'operation'] as const,
  registers: [registry],
});

export const llmRequestDuration = new Histogram({
  name: 'integrax_llm_request_duration_seconds',
  help: 'LLM request duration in seconds',
  labelNames: ['tenant_id', 'model'] as const,
  buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60],
  registers: [registry],
});

export const llmTokensUsed = new Counter({
  name: 'integrax_llm_tokens_used_total',
  help: 'Total LLM tokens used',
  labelNames: ['tenant_id', 'model', 'type'] as const,
  registers: [registry],
});

// ============================================
// Middleware for Express
// ============================================

export interface MetricsMiddlewareOptions {
  excludePaths?: string[];
}

export function metricsMiddleware(options: MetricsMiddlewareOptions = {}) {
  const excludePaths = options.excludePaths || ['/health', '/metrics'];

  return (req: any, res: any, next: any) => {
    if (excludePaths.some((p) => req.path.startsWith(p))) {
      return next();
    }

    const start = process.hrtime.bigint();
    const tenantId = req.tenantId || 'unknown';

    res.on('finish', () => {
      const duration = Number(process.hrtime.bigint() - start) / 1e9;
      const labels = {
        method: req.method,
        path: normalizePath(req.route?.path || req.path),
        status: res.statusCode.toString(),
        tenant_id: tenantId,
      };

      httpRequestsTotal.inc(labels);
      httpRequestDuration.observe(labels, duration);
      tenantApiCalls.inc({ tenant_id: tenantId, endpoint: labels.path });
    });

    next();
  };
}

// ============================================
// Metrics Endpoint Handler
// ============================================

export async function getMetrics(): Promise<string> {
  return registry.metrics();
}

export function getMetricsContentType(): string {
  return registry.contentType;
}

export function metricsHandler() {
  return async (_req: any, res: any) => {
    try {
      res.set('Content-Type', registry.contentType);
      res.end(await registry.metrics());
    } catch (error) {
      res.status(500).end(String(error));
    }
  };
}

// ============================================
// Helper Functions
// ============================================

function normalizePath(path: string): string {
  // Replace UUIDs and IDs with placeholders
  return path
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ':id')
    .replace(/\/\d+/g, '/:id')
    .replace(/\/ten_\w+/g, '/:tenantId')
    .replace(/\/con_\w+/g, '/:connectorId')
    .replace(/\/wf_\w+/g, '/:workflowId');
}

// ============================================
// Metric Recording Helpers
// ============================================

export const metrics = {
  // HTTP
  recordHttpRequest(method: string, path: string, status: number, duration: number, tenantId?: string) {
    const labels = { method, path: normalizePath(path), status: status.toString(), tenant_id: tenantId || 'unknown' };
    httpRequestsTotal.inc(labels);
    httpRequestDuration.observe(labels, duration);
  },

  // Workflows
  recordWorkflowStart(tenantId: string, workflowType: string) {
    workflowsStarted.inc({ tenant_id: tenantId, workflow_type: workflowType });
    workflowsActive.inc({ tenant_id: tenantId, workflow_type: workflowType });
  },

  recordWorkflowComplete(tenantId: string, workflowType: string, status: 'success' | 'failed' | 'cancelled', duration: number) {
    workflowsCompleted.inc({ tenant_id: tenantId, workflow_type: workflowType, status });
    workflowsActive.dec({ tenant_id: tenantId, workflow_type: workflowType });
    workflowDuration.observe({ tenant_id: tenantId, workflow_type: workflowType }, duration);
  },

  // Connectors
  recordConnectorCall(tenantId: string, connectorId: string, operation: string, status: 'success' | 'error', duration: number) {
    connectorCallsTotal.inc({ tenant_id: tenantId, connector_id: connectorId, operation, status });
    connectorCallDuration.observe({ tenant_id: tenantId, connector_id: connectorId, operation }, duration);
    if (status === 'error') {
      connectorErrors.inc({ tenant_id: tenantId, connector_id: connectorId, error_type: 'call_failed' });
    }
  },

  // Events
  recordEvent(tenantId: string, eventType: string, source: string) {
    eventsReceived.inc({ tenant_id: tenantId, event_type: eventType, source });
  },

  recordEventProcessed(tenantId: string, eventType: string, status: 'success' | 'failed', duration: number) {
    eventsProcessed.inc({ tenant_id: tenantId, event_type: eventType, status });
    eventProcessingDuration.observe({ tenant_id: tenantId, event_type: eventType }, duration);
  },

  // LLM
  recordLlmRequest(tenantId: string, model: string, operation: string, duration: number, inputTokens: number, outputTokens: number) {
    llmRequestsTotal.inc({ tenant_id: tenantId, model, operation });
    llmRequestDuration.observe({ tenant_id: tenantId, model }, duration);
    llmTokensUsed.inc({ tenant_id: tenantId, model, type: 'input' }, inputTokens);
    llmTokensUsed.inc({ tenant_id: tenantId, model, type: 'output' }, outputTokens);
  },

  // Tenant
  setTenantQuota(tenantId: string, quotaType: string, usagePercent: number) {
    tenantQuotaUsage.set({ tenant_id: tenantId, quota_type: quotaType }, usagePercent);
  },

  recordRateLimitHit(tenantId: string) {
    tenantRateLimitHits.inc({ tenant_id: tenantId });
  },

  setDlqSize(tenantId: string, size: number) {
    dlqSize.set({ tenant_id: tenantId }, size);
  },

  setActiveTenants(count: number) {
    tenantsActive.set(count);
  },
};

// Export registry for advanced usage
export { registry };
