/**
 * IntegraX Control Plane Server
 */

import 'dotenv/config'; // must be first — loads .env before any other module initializes

import express from 'express';
import helmet from 'helmet';
import { tenantsRouter } from './routes/tenants.js';
import { connectorsRouter } from './routes/connectors.js';
import { workflowsRouter } from './routes/workflows.js';
import { schemasRouter } from './routes/schemas.js';
import { adminRouter } from './routes/admin.js';
import { reconciliationRouter } from './routes/reconciliation.js';
import { webhooksRouter } from './routes/webhooks.js';
import { snapshotsRouter } from './routes/snapshots.js';
import { platformRouter } from './routes/platform.js';
import { timelineRouter } from './routes/timeline.js';
import { operationsRouter } from './routes/operations.js';
import { modulesRouter } from './routes/modules.js';
import { driftRouter } from './routes/drift.js';
import { streamRouter } from './routes/stream.js';
import { authRouter } from './routes/auth.js';
import { creditsRouter } from './routes/credits.js';
import { storageRouter } from './routes/storage.js';
import { licenseAdminRouter, licensePublicRouter } from './routes/license.js';
import { telemetryPublicRouter, telemetryAdminRouter } from './routes/telemetry.js';
import { getAuditLogs } from './middleware/audit.js';
import { requireAuth, requireRole } from './middleware/auth.js';
import { createLogger, requestLogger } from '@integrax/logger';
import { createHealthManager } from '@integrax/health';
import { metricsMiddleware } from '@integrax/metrics';
import { pool } from './store/db.js';

// ─── DEUDA TÉCNICA: Cache distribuido para mapping memory ─────────────────────
//
// POR QUÉ ESTÁ DESACTIVADO:
//   El control-plane corre como una sola instancia. MemoryCacheAdapter (Map
//   in-process, LRU 500 entradas, TTL 60 s) es suficiente y no tiene overhead.
//
// CUÁNDO ACTIVAR:
//   Cuando el control-plane escale a 2+ réplicas detrás de un load balancer.
//   En ese momento cada réplica tiene su propio Map → feedback de un operador
//   en la réplica A no se refleja en la réplica B hasta que venza el TTL (60 s).
//   Con Redis compartido, la invalidación es inmediata en todas las réplicas.
//
// CÓMO ACTIVAR (una sola línea de config en el env):
//   Descomentar el bloque de abajo. No requiere ningún otro cambio de código.
//   Asegurar que REDIS_URL esté seteado en el entorno de producción.
//
import { Redis } from 'ioredis';
import { RedisCacheAdapter } from './store/redis-cache-adapter.js';
import { setCacheAdapter } from './store/mapping-memory-repository.js';

if (process.env.REDIS_URL) {
  setCacheAdapter(new RedisCacheAdapter(new Redis(process.env.REDIS_URL)));
}
// ─────────────────────────────────────────────────────────────────────────────

const app: express.Application = express();

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? String(fallback), 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

if (!process.env.JWT_SECRET) {
  console.error('[Control Plane] FATAL: JWT_SECRET environment variable is not set');
  process.exit(1);
}

// Logger
const logger = createLogger({ service: 'control-plane', version: '0.1.0' });

// Middleware de seguridad
app.use(helmet());
app.use(express.json({ limit: '10mb' }));

// Logging estructurado de requests (omite /health y /ready)
app.use(requestLogger(logger));

// Métricas HTTP de Prometheus
app.use(metricsMiddleware({ excludePaths: ['/health', '/ready', '/metrics'] }));

// Health & Readiness
const health = createHealthManager('0.1.0');
health.register('postgres', async () => { await pool.query('SELECT 1'); });
app.use(health.router());

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

// Rutas de la API
app.use('/api/admin', adminRouter);
app.use('/api/tenants', tenantsRouter);
app.use('/api/connectors', connectorsRouter);
app.use('/api/workflows', workflowsRouter);
app.use('/api/schemas', schemasRouter);
app.use('/api/reconciliation', reconciliationRouter);

// ─── Nueva arquitectura orientada a eventos ──────────────────────────────────
// Webhooks: /webhooks/:connectorId
app.use('/webhooks', webhooksRouter);
// Snapshots: /api/tenants/:tenantId/snapshots/:entityType[/:canonicalId]
app.use('/api/tenants/:tenantId/snapshots', snapshotsRouter);
// Platform modules: /api/tenants/:tenantId/{orders,stock,invoices,products,consistency,...}
app.use('/api', platformRouter);
// Timeline: /api/tenants/:tenantId/timeline[/:id]
app.use('/api/tenants', timelineRouter);
app.use('/api/tenants/:tenantId/operations', operationsRouter);
app.use('/api/tenants', modulesRouter);
app.use('/api/drift', requireAuth, driftRouter);
app.use('/api/stream', streamRouter);

// ─── Auth (public — no JWT required) ─────────────────────────────────────────
app.use('/api/auth', authRouter);

// ─── Credits ──────────────────────────────────────────────────────────────────
app.use('/api/tenants/:tenantId/credits', creditsRouter);

// ─── Storage ──────────────────────────────────────────────────────────────────
app.use('/api/tenants/:tenantId/storage', storageRouter);

// ─── License management ───────────────────────────────────────────────────────
app.use('/api/admin/licenses', licenseAdminRouter);
app.use('/api/license', licensePublicRouter);

// ─── Telemetry ingest (self-hosted → integrax.dev) ────────────────────────────
app.use('/telemetry', telemetryPublicRouter);
app.use('/api/admin/telemetry', telemetryAdminRouter);

// Endpoint de logs de auditoría
app.get(
  '/api/audit',
  requireAuth,
  requireRole('platform_admin', 'tenant_admin'),
  (req, res) => {
    const { tenantId, userId, action, startDate, endDate, limit, offset } = req.query;

    // Los tenant admins solo pueden ver los logs de su propio tenant
    const effectiveTenantId =
      req.user?.role === 'tenant_admin' ? req.tenantId : (tenantId as string);

    const result = getAuditLogs({
      tenantId: effectiveTenantId,
      userId: userId as string,
      action: action as string,
      startDate: startDate ? new Date(startDate as string) : undefined,
      endDate: endDate ? new Date(endDate as string) : undefined,
      limit: limit ? parsePositiveInt(limit as string, 50) : undefined,
      offset: offset ? parsePositiveInt(offset as string, 0) : undefined,
    });

    res.json({
      success: true,
      data: result.entries,
      pagination: {
        total: result.total,
        limit: limit ? parsePositiveInt(limit as string, 50) : 50,
        offset: offset ? parsePositiveInt(offset as string, 0) : 0,
      },
    });
  }
);

// Endpoint de métricas (placeholder)
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

// Manejo de errores
app.use((err: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error({ err, path: req.path, method: req.method }, 'Unhandled error');
  const e = err as { status?: number; code?: string; message?: string };
  res.status(e.status ?? 500).json({
    success: false,
    error: {
      code: e.code ?? 'INTERNAL_ERROR',
      message: process.env.NODE_ENV === 'production' ? 'Internal server error' : (e.message ?? 'Unknown error'),
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

// Iniciar servidor
const PORT = parsePositiveInt(process.env.PORT, 3000);

async function startServer(): Promise<void> {
  // Migraciones ANTES de aceptar cualquier request.
  // Si fallan, el proceso aborta — el orquestador (Docker, k8s) lo reinicia.
  if (process.env.SKIP_MIGRATIONS !== 'true') {
    const { runMigrations } = await import('./migrate-runner.js');
    await runMigrations(pool, logger);
  }

  app.listen(PORT, () => {
    logger.info({
      port: PORT,
      endpoints: [
        'GET  /health       Liveness check',
        'GET  /ready        Readiness check',
        'GET  /metrics      Prometheus metrics',
        'GET  /api          API info',
        '*    /api/tenants   Tenant management',
        '*    /api/connectors Connector management',
        '*    /api/workflows Workflow management',
        'GET  /api/audit     Audit logs',
      ],
    }, `Control Plane API v0.1.0 running on port ${PORT}`);
  });
}

// Verificación de entry point ESM
const isMainModule = import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}`;
if (isMainModule || process.env.START_SERVER === 'true') {
  startServer().catch(err => {
    logger.error({ err }, 'Fatal error during startup');
    process.exit(1);
  });
}

export { app };
