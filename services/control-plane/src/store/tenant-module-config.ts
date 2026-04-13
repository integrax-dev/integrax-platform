import { pool } from './db.js';
import type { TenantModuleConfig } from '../types.js';

interface TenantModuleConfigRow {
  id: string;
  tenant_id: string;
  module_id: string;
  status: string;
  config: Record<string, string>;
  enabled_at: Date;
  updated_at: Date;
}

function rowToConfig(row: TenantModuleConfigRow): TenantModuleConfig {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    moduleId: row.module_id,
    status: row.status as TenantModuleConfig['status'],
    config: row.config,
    enabledAt: row.enabled_at,
    updatedAt: row.updated_at,
  };
}

export async function findTenantModuleConfig(
  tenantId: string,
  moduleId: string,
): Promise<TenantModuleConfig | null> {
  const result = await pool.query<TenantModuleConfigRow>(
    'SELECT * FROM tenant_module_config WHERE tenant_id = $1 AND module_id = $2',
    [tenantId, moduleId],
  );
  return result.rows.length > 0 ? rowToConfig(result.rows[0]) : null;
}

export async function listTenantModuleConfigs(tenantId: string): Promise<TenantModuleConfig[]> {
  const result = await pool.query<TenantModuleConfigRow>(
    'SELECT * FROM tenant_module_config WHERE tenant_id = $1 ORDER BY enabled_at ASC',
    [tenantId],
  );
  return result.rows.map(rowToConfig);
}

export async function saveTenantModuleConfig(cfg: TenantModuleConfig): Promise<string> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO tenant_module_config
       (id, tenant_id, module_id, status, config, enabled_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (tenant_id, module_id) DO UPDATE SET
       status     = EXCLUDED.status,
       config     = EXCLUDED.config,
       updated_at = EXCLUDED.updated_at
     RETURNING id`,
    [cfg.id, cfg.tenantId, cfg.moduleId, cfg.status, JSON.stringify(cfg.config), cfg.enabledAt, cfg.updatedAt],
  );
  return result.rows[0].id;
}

export async function deleteTenantModuleConfig(tenantId: string, moduleId: string): Promise<void> {
  await pool.query(
    'DELETE FROM tenant_module_config WHERE tenant_id = $1 AND module_id = $2',
    [tenantId, moduleId],
  );
}
