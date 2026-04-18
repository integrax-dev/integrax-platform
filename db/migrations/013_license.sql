-- License keys for self-hosted deployments
CREATE TABLE IF NOT EXISTS license_keys (
  id              TEXT PRIMARY KEY,
  key_hash        TEXT NOT NULL UNIQUE,
  tenant_name     TEXT NOT NULL,
  plan            TEXT NOT NULL DEFAULT 'enterprise',
  max_connectors  INT NOT NULL DEFAULT 100,
  max_users       INT NOT NULL DEFAULT 100,
  issued_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at      TIMESTAMPTZ,              -- NULL = perpetual
  revoked_at      TIMESTAMPTZ,
  last_heartbeat  TIMESTAMPTZ,
  heartbeat_data  JSONB,                    -- version, hostname, etc.
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS license_heartbeats (
  id              TEXT PRIMARY KEY,
  license_id      TEXT NOT NULL REFERENCES license_keys(id),
  reported_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  hostname        TEXT,
  version         TEXT,
  active_tenants  INT,
  payload         JSONB
);
CREATE INDEX IF NOT EXISTS idx_heartbeats_license ON license_heartbeats(license_id, reported_at DESC);
