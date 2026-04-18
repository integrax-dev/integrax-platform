import { pool } from './db.js';

export interface StorageUsage {
  tenantId: string;
  usedBytes: number;
  limitBytes: number;
  usedPercent: number;
}

export async function getStorageUsage(tenantId: string): Promise<StorageUsage> {
  const r = await pool.query<{ used_bytes: string; limit_bytes: string }>(
    `SELECT used_bytes, limit_bytes FROM storage_usage WHERE tenant_id = $1`,
    [tenantId],
  );
  const used = r.rows[0] ? parseInt(r.rows[0].used_bytes, 10) : 0;
  const limit = r.rows[0] ? parseInt(r.rows[0].limit_bytes, 10) : 1_073_741_824;
  return { tenantId, usedBytes: used, limitBytes: limit, usedPercent: Math.round((used / limit) * 100) };
}

export async function incrementStorageUsage(tenantId: string, deltaBytes: number): Promise<void> {
  await pool.query(
    `INSERT INTO storage_usage (tenant_id, used_bytes, updated_at)
     VALUES ($1, GREATEST(0, $2), NOW())
     ON CONFLICT (tenant_id) DO UPDATE SET
       used_bytes = GREATEST(0, storage_usage.used_bytes + $2),
       updated_at = NOW()`,
    [tenantId, deltaBytes],
  );
}

export async function checkStorageQuota(tenantId: string, uploadBytes: number): Promise<{ allowed: boolean; usage: StorageUsage }> {
  const usage = await getStorageUsage(tenantId);
  const allowed = usage.usedBytes + uploadBytes <= usage.limitBytes;
  return { allowed, usage };
}

export async function updateStorageLimitForPlan(tenantId: string, plan: string): Promise<void> {
  await pool.query(
    `INSERT INTO storage_usage (tenant_id, limit_bytes, updated_at)
     SELECT $1, pl.storage_bytes, NOW() FROM plan_limits pl WHERE pl.plan = $2
     ON CONFLICT (tenant_id) DO UPDATE SET
       limit_bytes = (SELECT storage_bytes FROM plan_limits WHERE plan = $2),
       updated_at = NOW()`,
    [tenantId, plan],
  );
}
