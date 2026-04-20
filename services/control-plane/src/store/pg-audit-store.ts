import { pool } from './db.js';
import type { AuditEntry } from '../types.js';

interface AuditRow {
  id: string;
  tenant_id: string | null;
  user_id: string;
  action: string;
  resource: string;
  resource_id: string;
  details: Record<string, unknown>;
  ip_address: string;
  user_agent: string;
  created_at: Date;
}

function rowToEntry(r: AuditRow): AuditEntry {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    userId: r.user_id,
    action: r.action,
    resource: r.resource,
    resourceId: r.resource_id,
    details: r.details,
    ipAddress: r.ip_address,
    userAgent: r.user_agent,
    createdAt: r.created_at,
  };
}

export async function saveAuditEntry(entry: AuditEntry): Promise<void> {
  await pool.query(
    `INSERT INTO audit_log
       (id, tenant_id, user_id, action, resource, resource_id, details, ip_address, user_agent, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     ON CONFLICT (id) DO NOTHING`,
    [
      entry.id,
      entry.tenantId,
      entry.userId,
      entry.action,
      entry.resource,
      entry.resourceId,
      JSON.stringify(entry.details),
      entry.ipAddress,
      entry.userAgent,
      entry.createdAt,
    ],
  );
}

export async function queryAuditLog(options: {
  tenantId?: string;
  userId?: string;
  action?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}): Promise<{ entries: AuditEntry[]; total: number }> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let i = 1;

  if (options.tenantId) { conditions.push(`tenant_id = $${i++}`); params.push(options.tenantId); }
  if (options.userId)   { conditions.push(`user_id = $${i++}`);   params.push(options.userId); }
  if (options.action)   { conditions.push(`action ILIKE $${i++}`); params.push(`%${options.action}%`); }
  if (options.startDate){ conditions.push(`created_at >= $${i++}`);params.push(options.startDate); }
  if (options.endDate)  { conditions.push(`created_at <= $${i++}`);params.push(options.endDate); }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const countResult = await pool.query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM audit_log ${where}`,
    params,
  );
  const total = parseInt(countResult.rows[0].count, 10);

  const limit  = options.limit  ?? 50;
  const offset = options.offset ?? 0;

  const rows = await pool.query<AuditRow>(
    `SELECT * FROM audit_log ${where} ORDER BY created_at DESC LIMIT $${i} OFFSET $${i + 1}`,
    [...params, limit, offset],
  );

  return { entries: rows.rows.map(rowToEntry), total };
}
