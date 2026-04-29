-- Migration 020: Observability Kernel tables
-- Adds: case_type to consistency_cases, tenant_sync_health, connector_contract tables

-- ─── Backfill case_type on consistency_cases (added in this migration) ────────

ALTER TABLE consistency_cases
  ADD COLUMN IF NOT EXISTS case_type TEXT NOT NULL DEFAULT 'STRICT_MISMATCH'
    CHECK (case_type IN (
      'STRICT_MISMATCH','POLICY_VIOLATION','APPROVAL_REQUIRED',
      'PROPAGATION_BLOCKED','MAPPING_UNCERTAINTY','CONNECTOR_FAILURE','SCHEMA_DRIFT'
    ));

-- ─── Tenant Sync Health ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS tenant_sync_health (
  tenant_id               TEXT        NOT NULL PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  evaluated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  mapping_validity_score  REAL        NOT NULL DEFAULT 1.0 CHECK (mapping_validity_score BETWEEN 0 AND 1),
  reconciliation_backlog  INT         NOT NULL DEFAULT 0 CHECK (reconciliation_backlog >= 0),
  drift_detected_flag     BOOLEAN     NOT NULL DEFAULT FALSE,
  active_behavior_profile TEXT,
  criticality_tier        TEXT        NOT NULL DEFAULT 'low'
                            CHECK (criticality_tier IN ('low', 'medium', 'high', 'critical')),
  open_case_count         INT         NOT NULL DEFAULT 0 CHECK (open_case_count >= 0),
  signal_count_24h        INT         NOT NULL DEFAULT 0 CHECK (signal_count_24h >= 0),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tenant_connector_health (
  id                       TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id                TEXT        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  connector_id             TEXT        NOT NULL,
  status                   TEXT        NOT NULL DEFAULT 'unknown'
                             CHECK (status IN ('healthy', 'degraded', 'failing', 'unknown')),
  last_successful_sync_at  TIMESTAMPTZ,
  last_sync_attempt_at     TIMESTAMPTZ,
  consecutive_failures     INT         NOT NULL DEFAULT 0 CHECK (consecutive_failures >= 0),
  pipeline_lag_ms          BIGINT,
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_tenant_connector_health UNIQUE (tenant_id, connector_id)
);

CREATE INDEX IF NOT EXISTS idx_connector_health_tenant ON tenant_connector_health(tenant_id);
CREATE INDEX IF NOT EXISTS idx_sync_health_tier ON tenant_sync_health(criticality_tier);

-- ─── Connector Contract Baselines ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS connector_contract_baselines (
  id              TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  connector_id    TEXT        NOT NULL UNIQUE,
  schema_version  TEXT        NOT NULL,
  -- JSONB array of { path, type, required, format?, enumValues? }
  fields          JSONB       NOT NULL DEFAULT '[]',
  registered_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Connector Contract Changes ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS connector_contract_changes (
  id                    TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  connector_id          TEXT        NOT NULL,
  field_path            TEXT        NOT NULL,
  change_type           TEXT        NOT NULL
                          CHECK (change_type IN (
                            'field_added', 'field_removed', 'type_changed',
                            'required_changed', 'format_changed', 'enum_changed'
                          )),
  impact_score          INT         NOT NULL DEFAULT 0 CHECK (impact_score BETWEEN 0 AND 5),
  affected_tenant_count INT         NOT NULL DEFAULT 0 CHECK (affected_tenant_count >= 0),
  detected_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  schema_version        TEXT,
  summary               TEXT        NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_contract_changes_connector ON connector_contract_changes(connector_id);
CREATE INDEX IF NOT EXISTS idx_contract_changes_detected  ON connector_contract_changes(detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_contract_changes_impact    ON connector_contract_changes(impact_score DESC);
