import { pool } from './db.js';
import type { Tenant, TenantStatus, TenantPlan, TenantLimits } from '../types.js';

// ─── Row → Domain ─────────────────────────────────────────────────────────────

interface TenantRow {
  id: string;
  name: string;
  plan: string;
  status: string;
  owner_id: string;
  limits: TenantLimits;
  metadata: Record<string, string>;
  api_key_hash: string;
  webhook_secret: string;
  created_at: Date;
  updated_at: Date;
}

function rowToTenant(row: TenantRow): Tenant {
  return {
    id: row.id,
    name: row.name,
    plan: row.plan as TenantPlan,
    status: row.status as TenantStatus,
    ownerId: row.owner_id,
    limits: row.limits,
    metadata: row.metadata,
    apiKeyHash: row.api_key_hash,
    webhookSecret: row.webhook_secret,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ─── Repository functions ─────────────────────────────────────────────────────

export async function getTenant(id: string): Promise<Tenant | null> {
  const result = await pool.query<TenantRow>(
    'SELECT * FROM tenants WHERE id = $1',
    [id],
  );
  return result.rows.length > 0 ? rowToTenant(result.rows[0]) : null;
}

export async function saveTenant(tenant: Tenant): Promise<void> {
  await pool.query(
    `INSERT INTO tenants
       (id, name, plan, status, owner_id, limits, metadata, api_key_hash, webhook_secret, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     ON CONFLICT (id) DO UPDATE SET
       name           = EXCLUDED.name,
       plan           = EXCLUDED.plan,
       status         = EXCLUDED.status,
       owner_id       = EXCLUDED.owner_id,
       limits         = EXCLUDED.limits,
       metadata       = EXCLUDED.metadata,
       api_key_hash   = EXCLUDED.api_key_hash,
       webhook_secret = EXCLUDED.webhook_secret,
       updated_at     = EXCLUDED.updated_at`,
    [
      tenant.id,
      tenant.name,
      tenant.plan,
      tenant.status,
      tenant.ownerId,
      JSON.stringify(tenant.limits),
      JSON.stringify(tenant.metadata),
      tenant.apiKeyHash,
      tenant.webhookSecret,
      tenant.createdAt,
      tenant.updatedAt,
    ],
  );
}

export interface ListTenantsOptions {
  status?: TenantStatus;
  plan?: TenantPlan;
  page?: number;
  pageSize?: number;
}

export async function listTenants(opts: ListTenantsOptions = {}): Promise<{
  data: Tenant[];
  totalItems: number;
}> {
  const { status, plan, page = 1, pageSize = 20 } = opts;
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (status) {
    params.push(status);
    conditions.push(`status = $${params.length}`);
  }
  if (plan) {
    params.push(plan);
    conditions.push(`plan = $${params.length}`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const countResult = await pool.query<{ count: string }>(
    `SELECT COUNT(*) as count FROM tenants ${where}`,
    params,
  );
  const totalItems = parseInt(countResult.rows[0].count, 10);

  const offset = (page - 1) * pageSize;
  params.push(pageSize, offset);
  const dataResult = await pool.query<TenantRow>(
    `SELECT * FROM tenants ${where} ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );

  return { data: dataResult.rows.map(rowToTenant), totalItems };
}

export async function getTenantByApiKeyHash(hash: string): Promise<Tenant | null> {
  const result = await pool.query<TenantRow>(
    'SELECT * FROM tenants WHERE api_key_hash = $1',
    [hash],
  );
  return result.rows.length > 0 ? rowToTenant(result.rows[0]) : null;
}
