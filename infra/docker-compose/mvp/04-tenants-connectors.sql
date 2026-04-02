-- Migration 04: Tenants and Tenant Connectors tables
-- Replaces the in-memory Map stores in control-plane (TD-004)

\c integrax;

CREATE TABLE IF NOT EXISTS tenants (
    id              VARCHAR(50)  PRIMARY KEY,        -- ten_ULID
    name            VARCHAR(100) NOT NULL,
    plan            VARCHAR(20)  NOT NULL,
    status          VARCHAR(20)  NOT NULL DEFAULT 'active',
    owner_id        VARCHAR(50)  NOT NULL,
    limits          JSONB        NOT NULL DEFAULT '{}',
    metadata        JSONB        NOT NULL DEFAULT '{}',
    api_key_hash    TEXT         NOT NULL,
    webhook_secret  TEXT         NOT NULL,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tenants_status ON tenants(status);
CREATE INDEX IF NOT EXISTS idx_tenants_plan   ON tenants(plan);

CREATE TABLE IF NOT EXISTS tenant_connectors (
    id                VARCHAR(50)  PRIMARY KEY,       -- tc_ULID
    tenant_id         VARCHAR(50)  NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    connector_id      VARCHAR(100) NOT NULL,
    status            VARCHAR(20)  NOT NULL DEFAULT 'configured',
    credentials       JSONB        NOT NULL DEFAULT '{}',  -- AES-256-CBC encrypted at app layer
    last_tested_at    TIMESTAMPTZ,
    last_test_result  VARCHAR(10),                    -- 'success' | 'failed' | NULL
    created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, connector_id)
);

CREATE INDEX IF NOT EXISTS idx_tenant_connectors_tenant_id ON tenant_connectors(tenant_id);
