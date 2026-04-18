/**
 * License management — self-hosted deployments
 *
 * POST /api/admin/licenses          issue a license key
 * GET  /api/admin/licenses          list all licenses
 * DELETE /api/admin/licenses/:id    revoke license
 *
 * POST /api/license/validate        self-hosted validates their key on startup
 * POST /api/license/heartbeat       self-hosted pings every 30 min
 */

import { Router, Request, Response } from 'express';
import { ulid } from 'ulid';
import { randomBytes, createHash } from 'crypto';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { pool } from '../store/db.js';

const adminRouter = Router();
const publicRouter = Router();

function hashKey(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

// ─── Admin routes ─────────────────────────────────────────────────────────────

adminRouter.post(
  '/',
  requireAuth,
  requireRole('platform_admin'),
  async (req: Request, res: Response) => {
    const { tenantName, plan, maxConnectors, maxUsers, expiresAt } = req.body as {
      tenantName?: string;
      plan?: string;
      maxConnectors?: number;
      maxUsers?: number;
      expiresAt?: string;
    };

    if (!tenantName) {
      return res.status(400).json({ success: false, error: { code: 'MISSING_TENANT_NAME' } });
    }

    const rawKey = `ixl_${randomBytes(32).toString('hex')}`;
    const keyHash = hashKey(rawKey);
    const id = `lic_${ulid()}`;

    await pool.query(
      `INSERT INTO license_keys (id, key_hash, tenant_name, plan, max_connectors, max_users, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [id, keyHash, tenantName, plan ?? 'enterprise', maxConnectors ?? 100, maxUsers ?? 100, expiresAt ?? null],
    );

    res.status(201).json({
      success: true,
      data: {
        id,
        licenseKey: rawKey,
        tenantName,
        plan: plan ?? 'enterprise',
        expiresAt: expiresAt ?? null,
        warning: 'Store this license key securely — it will not be shown again.',
      },
    });
  },
);

adminRouter.get(
  '/',
  requireAuth,
  requireRole('platform_admin'),
  async (_req: Request, res: Response) => {
    const r = await pool.query(
      `SELECT id, tenant_name, plan, max_connectors, max_users, issued_at, expires_at, revoked_at, last_heartbeat, heartbeat_data
       FROM license_keys ORDER BY created_at DESC`,
    );
    res.json({ success: true, data: r.rows });
  },
);

adminRouter.delete(
  '/:id',
  requireAuth,
  requireRole('platform_admin'),
  async (req: Request, res: Response) => {
    await pool.query(
      `UPDATE license_keys SET revoked_at = NOW() WHERE id = $1`,
      [req.params.id],
    );
    res.json({ success: true, data: { revoked: req.params.id } });
  },
);

// ─── Public routes (called by self-hosted instances) ──────────────────────────

publicRouter.post('/validate', async (req: Request, res: Response) => {
  const { licenseKey } = req.body as { licenseKey?: string };
  if (!licenseKey) {
    return res.status(400).json({ valid: false, error: 'Missing licenseKey' });
  }

  const keyHash = hashKey(licenseKey);
  const r = await pool.query(
    `SELECT id, tenant_name, plan, max_connectors, max_users, expires_at, revoked_at
     FROM license_keys WHERE key_hash = $1`,
    [keyHash],
  );

  if (r.rows.length === 0) {
    return res.status(401).json({ valid: false, error: 'License key not found' });
  }

  const lic = r.rows[0] as {
    id: string; tenant_name: string; plan: string;
    max_connectors: number; max_users: number;
    expires_at: Date | null; revoked_at: Date | null;
  };

  if (lic.revoked_at) {
    return res.status(403).json({ valid: false, error: 'License revoked' });
  }
  if (lic.expires_at && new Date(lic.expires_at) < new Date()) {
    return res.status(403).json({ valid: false, error: 'License expired' });
  }

  res.json({
    valid: true,
    licenseId: lic.id,
    tenantName: lic.tenant_name,
    plan: lic.plan,
    limits: { maxConnectors: lic.max_connectors, maxUsers: lic.max_users },
    expiresAt: lic.expires_at,
  });
});

publicRouter.post('/heartbeat', async (req: Request, res: Response) => {
  const { licenseKey, hostname, version, activeTenants, ...extra } = req.body as {
    licenseKey?: string;
    hostname?: string;
    version?: string;
    activeTenants?: number;
    [k: string]: unknown;
  };

  if (!licenseKey) {
    return res.status(400).json({ ok: false, error: 'Missing licenseKey' });
  }

  const keyHash = hashKey(licenseKey);
  const r = await pool.query<{ id: string; revoked_at: Date | null }>(
    `SELECT id, revoked_at FROM license_keys WHERE key_hash = $1`,
    [keyHash],
  );

  if (r.rows.length === 0 || r.rows[0].revoked_at) {
    return res.status(403).json({ ok: false, error: 'Invalid or revoked license' });
  }

  const licId = r.rows[0].id;
  const payload = { hostname, version, activeTenants, ...extra };

  await pool.query(
    `INSERT INTO license_heartbeats (id, license_id, hostname, version, active_tenants, payload)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, $5)`,
    [licId, hostname ?? null, version ?? null, activeTenants ?? null, JSON.stringify(payload)],
  );

  await pool.query(
    `UPDATE license_keys SET last_heartbeat = NOW(), heartbeat_data = $1 WHERE id = $2`,
    [JSON.stringify(payload), licId],
  );

  res.json({ ok: true, timestamp: new Date().toISOString() });
});

export { adminRouter as licenseAdminRouter, publicRouter as licensePublicRouter };
