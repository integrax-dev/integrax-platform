/**
 * Rutas del panel de administración (admin-panel).
 *
 * Separadas de /api/tenants para:
 *  - Permitir autenticación con credenciales de plataforma sin contexto de tenant.
 *  - Adaptar shapes de respuesta al formato esperado por el admin-panel React.
 *
 * Variables de entorno:
 *   ADMIN_EMAIL    — email del administrador (default: admin@integrax.io)
 *   ADMIN_PASSWORD — contraseña en texto plano para MVP (default: integrax-dev)
 *                    En producción, reemplazar por una implementación con bcrypt o OIDC.
 */

import { Router, Request, Response } from 'express';
import * as jose from 'jose';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { listTenants } from '../store/tenants.js';
import { getAuditLogs } from '../middleware/audit.js';
import { pool } from '../store/db.js';

const router: Router = Router();

type DashboardPoint = { name: string; events: number; success: number; failed: number };
type ConnectorUsagePoint = { name: string; calls: number };
type AdminRuntimeConfig = {
  jwtSecret: Uint8Array;
  adminEmail: string;
  adminPassword: string;
};

function emptyEventsData(): DashboardPoint[] {
  return ['00:00', '04:00', '08:00', '12:00', '16:00', '20:00'].map(name => ({
    name,
    events: 0,
    success: 0,
    failed: 0,
  }));
}

async function loadEventsData(): Promise<DashboardPoint[]> {
  const result = await pool.query<{
    bucket: string;
    events: string;
    success: string;
    failed: string;
  }>(
    `SELECT
       TO_CHAR(DATE_TRUNC('hour', created_at), 'HH24:00') AS bucket,
       COUNT(*)::text AS events,
       COUNT(*) FILTER (WHERE COALESCE((diff_payload->'summary'->>'breakingCount')::int, 0) = 0)::text AS success,
       COUNT(*) FILTER (WHERE COALESCE((diff_payload->'summary'->>'breakingCount')::int, 0) > 0)::text AS failed
     FROM schema_diff_reports
     WHERE created_at >= NOW() - INTERVAL '24 hours'
     GROUP BY 1
     ORDER BY 1`,
  );

  const base = new Map(emptyEventsData().map(point => [point.name, point]));
  for (const row of result.rows) {
    base.set(row.bucket, {
      name: row.bucket,
      events: Number(row.events),
      success: Number(row.success),
      failed: Number(row.failed),
    });
  }

  return [...base.values()];
}

async function loadConnectorUsage(): Promise<ConnectorUsagePoint[]> {
  const result = await pool.query<{ name: string; calls: string }>(
    `SELECT connector_id AS name, COUNT(*)::text AS calls
     FROM (
       SELECT source_connector_id AS connector_id FROM schema_diff_reports
       UNION ALL
       SELECT target_connector_id AS connector_id FROM schema_diff_reports
     ) combined
     WHERE connector_id IS NOT NULL
     GROUP BY connector_id
     ORDER BY COUNT(*) DESC, connector_id ASC
     LIMIT 5`,
  );

  return result.rows.map(row => ({
    name: row.name,
    calls: Number(row.calls),
  }));
}

async function loadDashboardStats() {
  const [connectorCountResult, reportStatsResult, incidentStatsResult, feedbackStatsResult] = await Promise.all([
    pool.query<{ count: string }>('SELECT COUNT(*)::text AS count FROM tenant_connectors WHERE status = $1', ['configured']),
    pool.query<{ events_today: string; breaking_reports: string; avg_coverage: string | null }>(
      `SELECT
         COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours')::text AS events_today,
         COUNT(*) FILTER (WHERE COALESCE((diff_payload->'summary'->>'breakingCount')::int, 0) > 0)::text AS breaking_reports,
         ROUND(AVG(COALESCE((diff_payload->'summary'->>'coveragePercent')::numeric, 0)), 2)::text AS avg_coverage
       FROM schema_diff_reports`,
    ),
    pool.query<{ open_incidents: string }>(
      `SELECT COUNT(*)::text AS open_incidents
       FROM drift_incidents
       WHERE status IN ('open', 'investigating')`,
    ),
    pool.query<{ mapping_feedback_24h: string; avg_confidence: string | null }>(
      `SELECT
         COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours')::text AS mapping_feedback_24h,
         ROUND(AVG(to_confidence)::numeric, 2)::text AS avg_confidence
       FROM confidence_events
       WHERE entity_type = 'mapping'`,
    ),
  ]);

  const connectors = Number(connectorCountResult.rows[0]?.count ?? 0);
  const eventsToday = Number(reportStatsResult.rows[0]?.events_today ?? 0);
  const breakingReports = Number(reportStatsResult.rows[0]?.breaking_reports ?? 0);
  const avgCoverage = Number(reportStatsResult.rows[0]?.avg_coverage ?? 0);
  const openIncidents = Number(incidentStatsResult.rows[0]?.open_incidents ?? 0);
  const mappingFeedbackToday = Number(feedbackStatsResult.rows[0]?.mapping_feedback_24h ?? 0);
  const avgConfidence = Number(feedbackStatsResult.rows[0]?.avg_confidence ?? 0);
  const uptime = eventsToday === 0
    ? 100
    : Number((((eventsToday - Math.min(eventsToday, breakingReports)) / eventsToday) * 100).toFixed(2));

  return {
    connectors,
    eventsToday,
    uptime,
    avgCoverage,
    openIncidents,
    mappingFeedbackToday,
    avgConfidence,
  };
}

function isProductionEnvironment(): boolean {
  return process.env.NODE_ENV === 'production';
}

function getAdminRuntimeConfig(): AdminRuntimeConfig {
  const jwtSecret = process.env.JWT_SECRET;
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (isProductionEnvironment()) {
    const missing = [
      !jwtSecret ? 'JWT_SECRET' : null,
      !adminEmail ? 'ADMIN_EMAIL' : null,
      !adminPassword ? 'ADMIN_PASSWORD' : null,
    ].filter(Boolean);

    if (missing.length > 0) {
      throw new Error(`Missing required admin environment variables: ${missing.join(', ')}`);
    }
  }

  return {
    jwtSecret: new TextEncoder().encode(jwtSecret ?? 'integrax-dev-secret-DO-NOT-USE-IN-PRODUCTION'),
    adminEmail: adminEmail ?? 'admin@integrax.io',
    adminPassword: adminPassword ?? 'integrax-dev',
  };
}

/**
 * POST /api/admin/login
 * Autentica con credenciales de plataforma y devuelve un JWT con role=platform_admin.
 */
router.post('/login', async (req: Request, res: Response) => {
  const { email, password } = req.body as { email?: string; password?: string };

  if (!email || !password) {
    return res.status(400).json({
      success: false,
      error: { code: 'MISSING_CREDENTIALS', message: 'email and password are required' },
    });
  }

  let runtimeConfig: AdminRuntimeConfig;
  try {
    runtimeConfig = getAdminRuntimeConfig();
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: {
        code: 'ADMIN_CONFIG_ERROR',
        message: error instanceof Error ? error.message : 'Admin authentication is not configured',
      },
    });
  }

  if (email !== runtimeConfig.adminEmail || password !== runtimeConfig.adminPassword) {
    return res.status(401).json({
      success: false,
      error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' },
    });
  }

  const token = await new jose.SignJWT({
    email,
    role: 'platform_admin',
    tenantId: null,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject('admin-platform')
    .setIssuedAt()
    .setExpirationTime('8h')
    .sign(runtimeConfig.jwtSecret);

  return res.json({
    success: true,
    user: {
      id: 'admin-platform',
      email,
      name: email.split('@')[0] ?? 'Admin',
      role: 'platform_admin' as const,
    },
    token,
  });
});

/**
 * GET /api/admin/tenants
 * Lista tenants con el shape esperado por el admin-panel.
 */
router.get(
  '/tenants',
  requireAuth,
  requireRole('platform_admin'),
  async (_req: Request, res: Response) => {
    const { data } = await listTenants({});

    const tenants = data.map((t) => ({
      id: t.id,
      name: t.name,
      plan: t.plan,
      status: t.status,
      events: 0, // Sin acceso a métricas en tiempo real en esta iteración
      created:
        t.createdAt instanceof Date
          ? t.createdAt.toISOString().slice(0, 10)
          : String(t.createdAt).slice(0, 10),
    }));

    return res.json({ success: true, tenants });
  },
);

/**
 * GET /api/admin/events
 * Últimos eventos de auditoría con el shape esperado por el admin-panel.
 */
router.get(
  '/events',
  requireAuth,
  requireRole('platform_admin', 'tenant_admin'),
  (req: Request, res: Response) => {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    const result = getAuditLogs({ limit });

    const events = result.entries.map((e) => ({
      id: e.id,
      type: e.action,
      tenant: e.tenantId ?? '-',
      connector: e.resource,
      status: e.details?.['success'] === false ? 'failed' : 'processed',
      time: e.createdAt.toLocaleString('es-AR'),
      error: e.details?.['error'] as string | undefined,
    }));

    return res.json({ success: true, events });
  },
);

/**
 * GET /api/admin/dashboard
 * Estadísticas agregadas para el dashboard.
 */
router.get(
  '/dashboard',
  requireAuth,
  requireRole('platform_admin', 'tenant_admin', 'operator'),
  async (_req: Request, res: Response) => {
    try {
      const [{ data: tenants, totalItems }, eventsData, connectorUsage, dashboardStats] = await Promise.all([
        listTenants({}),
        loadEventsData(),
        loadConnectorUsage(),
        loadDashboardStats(),
      ]);

      const activeTenants = tenants.filter((t) => t.status === 'active').length;
      const auditResult = getAuditLogs({ limit: 10 });

      const recentEvents = auditResult.entries.slice(0, 5).map((e) => ({
        id: e.id,
        type: e.action,
        tenant: e.tenantId ?? '-',
        status: e.details?.['success'] === false ? 'failed' : 'success',
        time: e.createdAt.toLocaleString('es-AR'),
      }));

      return res.json({
        success: true,
        eventsData,
        connectorUsage,
        recentEvents,
        stats: {
          tenants: totalItems,
          eventsToday: dashboardStats.eventsToday,
          connectors: dashboardStats.connectors,
          uptime: dashboardStats.uptime,
          openIncidents: dashboardStats.openIncidents,
          avgCoverage: dashboardStats.avgCoverage,
          mappingFeedbackToday: dashboardStats.mappingFeedbackToday,
          avgConfidence: dashboardStats.avgConfidence,
          tenantsChange: `${activeTenants} activos`,
          eventsChange: `${dashboardStats.eventsToday} diff reports en 24h`,
          connectorsChange: `${dashboardStats.connectors} configurados`,
          incidentsChange: `${dashboardStats.openIncidents} incidentes abiertos`,
          coverageChange: `${dashboardStats.mappingFeedbackToday} decisiones en 24h`,
        },
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        error: {
          code: 'DASHBOARD_FAILED',
          message: error instanceof Error ? error.message : 'Failed to load dashboard',
        },
      });
    }
  },
);

export { router as adminRouter };
