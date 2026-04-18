/**
 * Telemetry ingest — receives logs/metrics from self-hosted instances
 * POST /telemetry/ingest   (called by telemetry-agent)
 * GET  /api/admin/telemetry/:licenseId  view recent logs for a license
 */

import { Router, Request, Response } from 'express';
import { createHash } from 'crypto';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { pool } from '../store/db.js';

const publicRouter = Router();
const adminRouter = Router();

function hashKey(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

publicRouter.post('/ingest', async (req: Request, res: Response) => {
  const licenseKey = (req.headers['x-license-key'] as string) ?? req.body?.licenseKey;
  if (!licenseKey) {
    return res.status(401).json({ ok: false, error: 'Missing license key' });
  }

  const keyHash = hashKey(licenseKey);
  const r = await pool.query<{ id: string; revoked_at: Date | null }>(
    `SELECT id, revoked_at FROM license_keys WHERE key_hash = $1`,
    [keyHash],
  );

  if (r.rows.length === 0 || r.rows[0].revoked_at) {
    return res.status(403).json({ ok: false, error: 'Invalid or revoked license' });
  }

  const { logs = [], metrics = {} } = req.body as { logs?: unknown[]; metrics?: Record<string, number> };

  // Store up to 1000 log entries per batch to prevent abuse
  const safeLogs = Array.isArray(logs) ? logs.slice(0, 1000) : [];

  await pool.query(
    `INSERT INTO license_heartbeats (id, license_id, reported_at, payload)
     VALUES (gen_random_uuid(), $1, NOW(), $2)`,
    [r.rows[0].id, JSON.stringify({ logs: safeLogs, metrics })],
  );

  res.json({ ok: true, received: safeLogs.length });
});

// Admin: view telemetry for a specific license
adminRouter.get(
  '/:licenseId',
  requireAuth,
  requireRole('platform_admin'),
  async (req: Request, res: Response) => {
    const r = await pool.query(
      `SELECT reported_at, payload FROM license_heartbeats
       WHERE license_id = $1 ORDER BY reported_at DESC LIMIT 100`,
      [req.params.licenseId],
    );
    res.json({ success: true, data: r.rows });
  },
);

export { publicRouter as telemetryPublicRouter, adminRouter as telemetryAdminRouter };
