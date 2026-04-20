CREATE TABLE IF NOT EXISTS tenant_module_config (
  id          TEXT        PRIMARY KEY,
  tenant_id   TEXT        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  module_id   TEXT        NOT NULL,
  status      TEXT        NOT NULL DEFAULT 'active',
  config      JSONB       NOT NULL DEFAULT '{}',
  enabled_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_tenant_module UNIQUE (tenant_id, module_id)
);

CREATE INDEX IF NOT EXISTS idx_tenant_module_config_tenant ON tenant_module_config(tenant_id);
