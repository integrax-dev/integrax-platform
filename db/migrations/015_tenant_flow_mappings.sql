-- Per-tenant Activepieces flow mappings: event_type → flow_id
CREATE TABLE IF NOT EXISTS tenant_flow_mappings (
  id         TEXT PRIMARY KEY,
  tenant_id  TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  flow_id    TEXT NOT NULL,
  enabled    BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_tenant_event UNIQUE (tenant_id, event_type)
);

CREATE INDEX IF NOT EXISTS idx_tenant_flow_mappings_tenant ON tenant_flow_mappings(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_flow_mappings_event  ON tenant_flow_mappings(event_type);
