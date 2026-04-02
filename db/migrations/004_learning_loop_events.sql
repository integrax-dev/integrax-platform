-- ============================================================
-- Migration 004 — learning loop events
-- Explicit event history for operator feedback and confidence changes.
-- ============================================================

CREATE TABLE IF NOT EXISTS mapping_feedback_events (
  id                    TEXT        PRIMARY KEY,
  tenant_id             TEXT        NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  report_id             UUID        NOT NULL REFERENCES schema_diff_reports (id) ON DELETE CASCADE,
  source_connector_id   TEXT        NOT NULL,
  target_connector_id   TEXT        NOT NULL,
  source_path           TEXT        NOT NULL,
  target_path           TEXT        NOT NULL,
  accepted              BOOLEAN     NOT NULL,
  confidence_at_decision DOUBLE PRECISION NOT NULL,
  operator_user_id      TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mapping_feedback_events_tenant
  ON mapping_feedback_events (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_mapping_feedback_events_pair
  ON mapping_feedback_events (tenant_id, source_connector_id, target_connector_id, created_at DESC);

CREATE TABLE IF NOT EXISTS confidence_events (
  id               TEXT        PRIMARY KEY,
  tenant_id        TEXT        NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  entity_type      TEXT        NOT NULL,
  entity_id        TEXT        NOT NULL,
  from_confidence  DOUBLE PRECISION NOT NULL,
  to_confidence    DOUBLE PRECISION NOT NULL,
  reason           TEXT        NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_confidence_events_tenant
  ON confidence_events (tenant_id, entity_type, created_at DESC);
