import { pool } from './db.js';
import type { TenantConnector, ConnectorStatus } from '../types.js';

// ─── Row → Domain ─────────────────────────────────────────────────────────────

interface TenantConnectorRow {
  id: string;
  tenant_id: string;
  connector_id: string;
  status: string;
  credentials: Record<string, string>;
  last_tested_at: Date | null;
  last_test_result: string | null;
  created_at: Date;
  updated_at: Date;
}

function rowToTenantConnector(row: TenantConnectorRow): TenantConnector {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    connectorId: row.connector_id,
    status: row.status as ConnectorStatus,
    credentials: row.credentials,
    lastTestedAt: row.last_tested_at,
    lastTestResult: row.last_test_result as 'success' | 'failed' | null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ─── Repository functions ─────────────────────────────────────────────────────

export async function getTenantConnector(id: string): Promise<TenantConnector | null> {
  const result = await pool.query<TenantConnectorRow>(
    'SELECT * FROM tenant_connectors WHERE id = $1',
    [id],
  );
  return result.rows.length > 0 ? rowToTenantConnector(result.rows[0]) : null;
}

export async function findTenantConnector(
  tenantId: string,
  connectorId: string,
): Promise<TenantConnector | null> {
  const result = await pool.query<TenantConnectorRow>(
    'SELECT * FROM tenant_connectors WHERE tenant_id = $1 AND connector_id = $2',
    [tenantId, connectorId],
  );
  return result.rows.length > 0 ? rowToTenantConnector(result.rows[0]) : null;
}

export async function listTenantConnectors(tenantId: string): Promise<TenantConnector[]> {
  const result = await pool.query<TenantConnectorRow>(
    'SELECT * FROM tenant_connectors WHERE tenant_id = $1 ORDER BY created_at ASC',
    [tenantId],
  );
  return result.rows.map(rowToTenantConnector);
}

/**
 * Upsert a tenant connector.
 * Uses ON CONFLICT (tenant_id, connector_id) — the natural unique key — so
 * concurrent requests for the same connector never cause a constraint violation.
 * Returns the actual stored id (may differ from tc.id on conflict).
 */
export async function saveTenantConnector(tc: TenantConnector): Promise<string> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO tenant_connectors
       (id, tenant_id, connector_id, status, credentials, last_tested_at, last_test_result, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT (tenant_id, connector_id) DO UPDATE SET
       status           = EXCLUDED.status,
       credentials      = EXCLUDED.credentials,
       last_tested_at   = EXCLUDED.last_tested_at,
       last_test_result = EXCLUDED.last_test_result,
       updated_at       = EXCLUDED.updated_at
     RETURNING id`,
    [
      tc.id,
      tc.tenantId,
      tc.connectorId,
      tc.status,
      JSON.stringify(tc.credentials),
      tc.lastTestedAt,
      tc.lastTestResult,
      tc.createdAt,
      tc.updatedAt,
    ],
  );
  return result.rows[0].id;
}

export async function deleteTenantConnector(id: string): Promise<void> {
  await pool.query('DELETE FROM tenant_connectors WHERE id = $1', [id]);
}
