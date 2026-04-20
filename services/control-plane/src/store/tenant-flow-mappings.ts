import { pool } from './db.js';
import type { TenantFlowMapping } from '../types.js';

interface FlowMappingRow {
  id: string;
  tenant_id: string;
  event_type: string;
  flow_id: string;
  enabled: boolean;
  created_at: Date;
  updated_at: Date;
}

function rowToMapping(r: FlowMappingRow): TenantFlowMapping {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    eventType: r.event_type,
    flowId: r.flow_id,
    enabled: r.enabled,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export async function listFlowMappings(tenantId: string): Promise<TenantFlowMapping[]> {
  const result = await pool.query<FlowMappingRow>(
    'SELECT * FROM tenant_flow_mappings WHERE tenant_id = $1 ORDER BY created_at ASC',
    [tenantId],
  );
  return result.rows.map(rowToMapping);
}

export async function getFlowMapping(
  tenantId: string,
  eventType: string,
): Promise<TenantFlowMapping | null> {
  const result = await pool.query<FlowMappingRow>(
    'SELECT * FROM tenant_flow_mappings WHERE tenant_id = $1 AND event_type = $2',
    [tenantId, eventType],
  );
  return result.rows.length > 0 ? rowToMapping(result.rows[0]) : null;
}

export async function saveFlowMapping(m: TenantFlowMapping): Promise<void> {
  await pool.query(
    `INSERT INTO tenant_flow_mappings (id, tenant_id, event_type, flow_id, enabled, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (tenant_id, event_type) DO UPDATE SET
       flow_id    = EXCLUDED.flow_id,
       enabled    = EXCLUDED.enabled,
       updated_at = EXCLUDED.updated_at`,
    [m.id, m.tenantId, m.eventType, m.flowId, m.enabled, m.createdAt, m.updatedAt],
  );
}

export async function deleteFlowMapping(tenantId: string, eventType: string): Promise<void> {
  await pool.query(
    'DELETE FROM tenant_flow_mappings WHERE tenant_id = $1 AND event_type = $2',
    [tenantId, eventType],
  );
}

export async function getActiveFlowMappingsByEvent(eventType: string): Promise<TenantFlowMapping[]> {
  const result = await pool.query<FlowMappingRow>(
    'SELECT * FROM tenant_flow_mappings WHERE event_type = $1 AND enabled = true',
    [eventType],
  );
  return result.rows.map(rowToMapping);
}
