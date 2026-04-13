-- Migration 009: Drift incidents + baselines
-- Persistent storage for schema drift detected via schema-bridge comparisons.
-- Sources: SQL DDL, OpenAPI specs, Avro schemas, CSV headers, SOAP WSDLs.

CREATE TABLE IF NOT EXISTS drift_incidents (
  id                     TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  source_id              TEXT        NOT NULL,  -- connector_id, table name, or target label
  protocol               TEXT        NOT NULL,  -- 'sql' | 'openapi' | 'avro' | 'csv' | 'soap' | 'graphql'
  severity               TEXT        NOT NULL,  -- 'critical' | 'major' | 'minor'
  status                 TEXT        NOT NULL DEFAULT 'open',  -- 'open' | 'investigating' | 'resolved' | 'dismissed'
  bridge_report          JSONB,                 -- full BridgeReport from schema-bridge (diffs, confidence, mappings)
  impact_score           NUMERIC(4,2),          -- 0.0–1.0, from assessImpact()
  routing_target         TEXT,                  -- 'operator_review' | 'incident_alert' | 'timeline_trace' | 'auto_resolved'
  remediation_hints      JSONB,                 -- array of hint strings from impact scorer
  affected_tenants       TEXT[]      NOT NULL DEFAULT '{}',
  detected_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at            TIMESTAMPTZ,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_drift_incidents_status   ON drift_incidents(status);
CREATE INDEX IF NOT EXISTS idx_drift_incidents_protocol ON drift_incidents(protocol);
CREATE INDEX IF NOT EXISTS idx_drift_incidents_severity ON drift_incidents(severity);
CREATE INDEX IF NOT EXISTS idx_drift_incidents_source   ON drift_incidents(source_id);
CREATE INDEX IF NOT EXISTS idx_drift_incidents_detected ON drift_incidents(detected_at DESC);

-- Baseline: the "known-good" schema snapshot to compare against
CREATE TABLE IF NOT EXISTS drift_baselines (
  id          TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  source_id   TEXT        NOT NULL,  -- matches drift_incidents.source_id
  protocol    TEXT        NOT NULL,
  snapshot    JSONB       NOT NULL,  -- NormalizedSchema produced by the relevant adapter
  version     INTEGER     NOT NULL DEFAULT 1,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_baseline UNIQUE (source_id, protocol)
);

CREATE INDEX IF NOT EXISTS idx_drift_baselines_source ON drift_baselines(source_id);

-- Event buffer: hold events while a tenant is in maintenance mode
CREATE TABLE IF NOT EXISTS drift_event_buffer (
  id           TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id    TEXT        NOT NULL,
  source_system TEXT       NOT NULL,
  entity_type  TEXT        NOT NULL,
  payload      JSONB       NOT NULL,
  buffered_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_drift_event_buffer_tenant ON drift_event_buffer(tenant_id);

-- Auto-update trigger
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_drift_incidents_updated_at
  BEFORE UPDATE ON drift_incidents
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_drift_baselines_updated_at
  BEFORE UPDATE ON drift_baselines
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
