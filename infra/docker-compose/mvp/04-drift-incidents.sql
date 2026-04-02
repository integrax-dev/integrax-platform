-- ============================================================
-- Migration 04: drift_incidents
-- ============================================================

CREATE TABLE IF NOT EXISTS drift_incidents (
  id             TEXT        PRIMARY KEY,
  report_id      UUID        NOT NULL UNIQUE REFERENCES schema_diff_reports (id) ON DELETE CASCADE,
  tenant_id      TEXT        NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  status         TEXT        NOT NULL DEFAULT 'open',
  detected_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at    TIMESTAMPTZ,
  dismissed_at   TIMESTAMPTZ,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes          JSONB       NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_drift_incidents_tenant
  ON drift_incidents (tenant_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_drift_incidents_status
  ON drift_incidents (tenant_id, status, updated_at DESC);
