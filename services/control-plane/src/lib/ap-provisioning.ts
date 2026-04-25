/**
 * Per-tenant Activepieces project provisioning.
 *
 * AP CE doesn't expose a project-creation API and locks sign-up after the first
 * admin. But both IntegraX and AP share the same Postgres server, so we create
 * AP projects directly in the `activepieces` database — owned by the AP admin
 * user, distinguished by `externalId = tenantId`.
 *
 * The admin JWT token can query any project the admin owns, so server-side calls
 * keep using `ap-session.ts` for auth while swapping only the `projectId`.
 *
 * Tenant's projectId is cached in `tenant_module_config` (module_id = 'activepieces').
 */

import pg from 'pg';
import { randomBytes } from 'crypto';
import { ulid } from 'ulid';
import { findTenantModuleConfig, saveTenantModuleConfig } from '../store/tenant-module-config.js';

const MODULE_ID = 'activepieces';

// ─── AP Postgres connection (separate DB on the same server) ──────────────────

let _apPool: pg.Pool | null = null;

function getApPool(): pg.Pool {
  if (_apPool) return _apPool;
  _apPool = new pg.Pool({
    host:     process.env.AP_POSTGRES_HOST     ?? process.env.PGHOST     ?? 'localhost',
    port:     parseInt(process.env.AP_POSTGRES_PORT     ?? process.env.PGPORT     ?? '5432'),
    user:     process.env.AP_POSTGRES_USERNAME ?? process.env.PGUSER     ?? 'integrax',
    password: process.env.AP_POSTGRES_PASSWORD ?? process.env.PGPASSWORD ?? 'integrax',
    database: process.env.AP_POSTGRES_DATABASE ?? 'activepieces',
  });
  _apPool.on('error', () => { /* suppress idle-client noise */ });
  return _apPool;
}

// ─── AP admin info (read once from AP's project table) ────────────────────────

interface ApAdminInfo {
  userId: string;
  platformId: string;
  defaultProjectId: string;
  adminRoleId: string;
}
let _admin: ApAdminInfo | null = null;

async function getAdminInfo(): Promise<ApAdminInfo | null> {
  if (_admin) return _admin;
  try {
    const pool = getApPool();
    const { rows: proj } = await pool.query<{ pid: string; uid: string; plid: string }>(
      `SELECT id AS pid, "ownerId" AS uid, "platformId" AS plid
       FROM project ORDER BY created ASC LIMIT 1`,
    );
    if (!proj.length) return null;

    const { rows: roles } = await pool.query<{ id: string }>(
      `SELECT id FROM project_role WHERE name = 'Admin' LIMIT 1`,
    );
    const adminRoleId = roles[0]?.id ?? '';

    _admin = {
      userId: proj[0].uid,
      platformId: proj[0].plid,
      defaultProjectId: proj[0].pid,
      adminRoleId,
    };
    return _admin;
  } catch {
    return null;
  }
}

// ─── ID generator matching AP's nanoid(21) format ────────────────────────────

function apId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from(randomBytes(21), b => chars[b % chars.length]).join('');
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Returns the AP projectId for a tenant, creating it in AP's DB if it doesn't
 * exist yet. Idempotent — safe to call on every request.
 *
 * Falls back to the admin's default projectId if AP's DB is unreachable.
 */
export async function ensureApProject(tenantId: string, displayName?: string): Promise<string | null> {
  // 1. Check our own cache first
  const cached = await findTenantModuleConfig(tenantId, MODULE_ID);
  if (cached?.config?.['projectId']) return cached.config['projectId'];

  // 2. Need AP admin info to know ownerId + platformId
  const admin = await getAdminInfo();
  if (!admin) return null;

  // 3. Check if AP already has a project for this tenant (e.g. from a previous
  //    run where our DB write failed)
  try {
    const { rows } = await getApPool().query<{ id: string }>(
      `SELECT id FROM project
       WHERE "platformId" = $1 AND "externalId" = $2 AND deleted IS NULL LIMIT 1`,
      [admin.platformId, tenantId],
    );
    if (rows.length) {
      try { await _cacheProjectId(tenantId, rows[0].id); } catch { /* best-effort */ }
      return rows[0].id;
    }
  } catch {
    return null;
  }

  // 4. Create a new project + admin membership for this tenant
  const projectId = apId();
  const name = displayName ?? `Tenant ${tenantId}`;
  try {
    const pool = getApPool();
    await pool.query(
      `INSERT INTO project
         (id, created, updated, "ownerId", "displayName", "platformId", "externalId", type, icon)
       VALUES ($1, NOW(), NOW(), $2, $3, $4, $5, 'PERSONAL', '{"color":"VIOLET"}')`,
      [projectId, admin.userId, name, admin.platformId, tenantId],
    );

    // project_member row makes the project appear in GET /projects (list endpoint)
    if (admin.adminRoleId) {
      await pool.query(
        `INSERT INTO project_member (id, created, updated, "projectId", "platformId", "userId", "projectRoleId")
         VALUES ($1, NOW(), NOW(), $2, $3, $4, $5)
         ON CONFLICT DO NOTHING`,
        [apId(), projectId, admin.platformId, admin.userId, admin.adminRoleId],
      );
    }
  } catch {
    return null;
  }

  // Cache failure (e.g. tenant not yet in our DB) is non-fatal — next call re-caches via step 3
  try { await _cacheProjectId(tenantId, projectId); } catch { /* best-effort */ }
  return projectId;
}

async function _cacheProjectId(tenantId: string, projectId: string): Promise<void> {
  await saveTenantModuleConfig({
    id: ulid(),
    tenantId,
    moduleId: MODULE_ID,
    status: 'active',
    config: { projectId },
    enabledAt: new Date(),
    updatedAt: new Date(),
  });
}
