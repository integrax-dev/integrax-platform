/**
 * Rutas del panel de administración (admin-panel).
 *
 * Variables de entorno requeridas:
 *   JWT_SECRET     — FATAL si falta
 *   ADMIN_EMAIL    — default: admin@integrax.io
 *   ADMIN_PASSWORD — FATAL en producción si falta; dev default: integrax-dev
 */

import { Router, Request, Response } from 'express';
import * as jose from 'jose';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { listTenants } from '../store/tenants.js';
import { getAuditLogs } from '../middleware/audit.js';

const router: Router = Router();

function getJwtSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    // server.ts already fatals, but guard here too for tests
    throw new Error('JWT_SECRET is not set');
  }
  return new TextEncoder().encode(secret);
}

function getAdminCredentials() {
  const password = process.env.ADMIN_PASSWORD;
  if (!password && process.env.NODE_ENV === 'production') {
    console.error('[FATAL] ADMIN_PASSWORD is not set in production.');
    process.exit(1);
  }
  return {
    email: process.env.ADMIN_EMAIL ?? 'admin@integrax.io',
    password: password ?? 'integrax-dev',
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

  const creds = getAdminCredentials();

  if (email !== creds.email || password !== creds.password) {
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
    .sign(getJwtSecret());

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
    const { data: tenants, totalItems } = await listTenants({});
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
      eventsData: [],
      connectorUsage: [],
      recentEvents,
      stats: {
        tenants: totalItems,
        eventsToday: auditResult.total,
        connectors: 0,
        uptime: 99.9,
        tenantsChange: `${activeTenants} activos`,
        eventsChange: `${auditResult.total} eventos registrados`,
        connectorsChange: 'Ver conectores',
      },
    });
  },
);

export { router as adminRouter };
