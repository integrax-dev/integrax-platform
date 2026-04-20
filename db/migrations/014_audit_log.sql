-- Audit log persisted in Postgres (replaces in-memory array in middleware/audit.ts)
CREATE TABLE IF NOT EXISTS audit_log (
  id          TEXT PRIMARY KEY,
  tenant_id   TEXT,
  user_id     TEXT NOT NULL DEFAULT 'anonymous',
  action      TEXT NOT NULL,
  resource    TEXT NOT NULL DEFAULT '',
  resource_id TEXT NOT NULL DEFAULT '',
  details     JSONB NOT NULL DEFAULT '{}',
  ip_address  TEXT NOT NULL DEFAULT '',
  user_agent  TEXT NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_tenant  ON audit_log(tenant_id) WHERE tenant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_action  ON audit_log(action);
