/**
 * IntegraX Control Plane Server
 */

import express from 'express';
import helmet from 'helmet';
import { tenantsRouter } from './routes/tenants';
import { connectorsRouter } from './routes/connectors';
import { workflowsRouter } from './routes/workflows';
import { temporalWorkflowsRouter } from './routes/workflows-temporal';
import { getAuditLogs } from './middleware/audit';
import { requireAuth, requireRole } from './middleware/auth';

const app = express();

// Security middleware
app.use(helmet());
app.use(express.json({ limit: '10mb' }));

// Request logging
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`${req.method} ${req.path} ${res.statusCode} ${duration}ms`);
  });
  next();
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    version: '0.1.0',
    timestamp: new Date().toISOString(),
  });
});

// API info
app.get('/api', (req, res) => {
  res.json({
    name: 'IntegraX Control Plane API',
    version: '0.1.0',
    endpoints: {
      tenants: '/api/tenants',
      connectors: '/api/connectors',
      workflows: '/api/workflows',
      audit: '/api/audit',
      metrics: '/api/metrics',
    },
    documentation: '/api/docs',
  });
});

// API Routes
app.use('/api/tenants', tenantsRouter);
app.use('/api/connectors', connectorsRouter);
app.use('/api/workflows', workflowsRouter);
app.use('/api/workflows/temporal', temporalWorkflowsRouter);

// Audit logs endpoint
app.get(
  '/api/audit',
  requireAuth,
  requireRole('platform_admin', 'tenant_admin'),
  (req, res) => {
    const { tenantId, userId, action, startDate, endDate, limit, offset } = req.query;

    // Tenant admins can only see their own tenant's logs
    const effectiveTenantId =
      req.user?.role === 'tenant_admin' ? req.tenantId : (tenantId as string);

    const result = getAuditLogs({
      tenantId: effectiveTenantId,
      userId: userId as string,
      action: action as string,
      startDate: startDate ? new Date(startDate as string) : undefined,
      endDate: endDate ? new Date(endDate as string) : undefined,
      limit: limit ? parseInt(limit as string) : undefined,
      offset: offset ? parseInt(offset as string) : undefined,
    });

    res.json({
      success: true,
      data: result.entries,
      pagination: {
        total: result.total,
        limit: limit ? parseInt(limit as string) : 50,
        offset: offset ? parseInt(offset as string) : 0,
      },
    });
  }
);

// Metrics endpoint (placeholder)
app.get(
  '/api/metrics',
  requireAuth,
  requireRole('platform_admin', 'tenant_admin', 'operator'),
  (req, res) => {
    // TODO: Implement real metrics from Prometheus/Redis
    const tenantId = req.tenantId || 'all';

    res.json({
      success: true,
      data: {
        tenantId,
        period: 'last_24h',
        metrics: {
          eventsReceived: 1234,
          eventsProcessed: 1200,
          eventsFailed: 34,
          workflowRuns: 567,
          successfulRuns: 550,
          failedRuns: 17,
          avgLatencyMs: 245,
          p95LatencyMs: 890,
          apiCalls: 8901,
          rateLimitHits: 12,
        },
      },
    });
  }
);

// Error handling
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled error:', err);

  res.status(err.status || 500).json({
    success: false,
    error: {
      code: err.code || 'INTERNAL_ERROR',
      message: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
    },
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `Endpoint ${req.method} ${req.path} not found`,
    },
  });
});

// Start server
const PORT = parseInt(process.env.PORT || '3000', 10);

// ESM entry point check
const isMainModule = import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}`;
if (isMainModule || process.env.START_SERVER === 'true') {
  app.listen(PORT, () => {
    console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║   ██╗███╗   ██╗████████╗███████╗ ██████╗ ██████╗  █████╗      ║
║   ██║████╗  ██║╚══██╔══╝██╔════╝██╔════╝ ██╔══██╗██╔══██╗     ║
║   ██║██╔██╗ ██║   ██║   █████╗  ██║  ███╗██████╔╝███████║     ║
║   ██║██║╚██╗██║   ██║   ██╔══╝  ██║   ██║██╔══██╗██╔══██║     ║
║   ██║██║ ╚████║   ██║   ███████╗╚██████╔╝██║  ██║██║  ██║     ║
║   ╚═╝╚═╝  ╚═══╝   ╚═╝   ╚══════╝ ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝     ║
║                                                               ║
║              Control Plane API v0.1.0                         ║
╚═══════════════════════════════════════════════════════════════╝

Server running on http://localhost:${PORT}

Endpoints:
  GET  /health              Health check
  GET  /api                 API info
  *    /api/tenants         Tenant management
  *    /api/connectors      Connector management
  *    /api/workflows       Workflow management
  GET  /api/audit           Audit logs
  GET  /api/metrics         Metrics
`);
  });
}

export { app };
