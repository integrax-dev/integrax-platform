-- ─── Drift Incidents ──────────────────────────────────────────────────────────
-- Schema drift events detected by schema-bridge.
-- Run manually: psql $DATABASE_URL -f 05-drift-incidents.sql

CREATE TABLE IF NOT EXISTS drift_incidents (
  id                 TEXT        PRIMARY KEY,
  source_id          TEXT        NOT NULL,
  protocol           TEXT        NOT NULL,
  severity           TEXT        NOT NULL CHECK (severity IN ('critical','major','minor')),
  status             TEXT        NOT NULL DEFAULT 'open'
                                 CHECK (status IN ('open','investigating','resolved','dismissed')),
  bridge_report      JSONB,
  impact_score       NUMERIC(4,3),
  routing_target     TEXT,
  remediation_hints  JSONB       NOT NULL DEFAULT '[]',
  affected_tenants   TEXT[]      NOT NULL DEFAULT '{}',
  llm_analysis       JSONB       NOT NULL DEFAULT '[]',
  detected_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at        TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_drift_incidents_status   ON drift_incidents(status);
CREATE INDEX IF NOT EXISTS idx_drift_incidents_severity ON drift_incidents(severity);
CREATE INDEX IF NOT EXISTS idx_drift_incidents_source   ON drift_incidents(source_id);
CREATE INDEX IF NOT EXISTS idx_drift_incidents_detected ON drift_incidents(detected_at DESC);

-- ─── Schema Baselines ─────────────────────────────────────────────────────────
-- One row per source_id — stores the "known good" schema snapshot.

CREATE TABLE IF NOT EXISTS drift_baselines (
  id           TEXT        PRIMARY KEY,
  source_id    TEXT        NOT NULL UNIQUE,
  protocol     TEXT        NOT NULL,
  raw_schema   TEXT        NOT NULL,
  fingerprint  TEXT,
  captured_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_drift_baselines_source ON drift_baselines(source_id);
