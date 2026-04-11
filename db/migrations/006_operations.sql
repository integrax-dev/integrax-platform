-- --- Migracion 006: Operation / Command Engine ------------------------------
-- operations:        registro principal de cada operacion enviada
-- operation_attempts: intentos de ejecucion (retry log)
-- approvals:         solicitudes de aprobacion humana
-- idempotency_keys:  dedup de requests repetidos

-- ─── operations ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS operations (
  operation_id      TEXT        PRIMARY KEY,               -- ulid o uuid del cliente
  tenant_id         TEXT        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  command_name      TEXT        NOT NULL,
  profile_id        TEXT,
  status            TEXT        NOT NULL DEFAULT 'requested',
  actor             JSONB       NOT NULL DEFAULT '{}',     -- {type, id, role, tenantId}
  target            JSONB       NOT NULL DEFAULT '{}',     -- {entityType, canonicalId, sourceSystem, externalId}
  payload           JSONB,
  options           JSONB,
  context           JSONB,
  result            JSONB,
  errors            JSONB       NOT NULL DEFAULT '[]',     -- OperationError[]
  attempt_count     INTEGER     NOT NULL DEFAULT 0,
  idempotency_key   TEXT,
  correlation_id    TEXT,
  approval_request_id TEXT,
  requested_at      TIMESTAMPTZ NOT NULL,
  status_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_operations_tenant_status
  ON operations (tenant_id, status);

CREATE INDEX IF NOT EXISTS idx_operations_tenant_command
  ON operations (tenant_id, command_name);

CREATE INDEX IF NOT EXISTS idx_operations_idempotency
  ON operations (tenant_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_operations_created_at
  ON operations (tenant_id, created_at DESC);

-- ─── operation_attempts ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS operation_attempts (
  attempt_id    TEXT        PRIMARY KEY,               -- ulid
  operation_id  TEXT        NOT NULL REFERENCES operations(operation_id) ON DELETE CASCADE,
  tenant_id     TEXT        NOT NULL,
  attempt_num   INTEGER     NOT NULL,
  connector_id  TEXT,
  action        TEXT,
  status        TEXT        NOT NULL,                  -- 'success'|'failed'|'timeout'
  result        JSONB,
  error         JSONB,
  started_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at   TIMESTAMPTZ,
  duration_ms   INTEGER
);

CREATE INDEX IF NOT EXISTS idx_attempts_operation
  ON operation_attempts (operation_id, attempt_num);

-- ─── approvals ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS approvals (
  approval_id     TEXT        PRIMARY KEY,             -- ulid
  operation_id    TEXT        NOT NULL REFERENCES operations(operation_id) ON DELETE CASCADE,
  tenant_id       TEXT        NOT NULL,
  command_name    TEXT        NOT NULL,
  actor           JSONB       NOT NULL DEFAULT '{}',
  payload         JSONB,
  reason          TEXT        NOT NULL,
  status          TEXT        NOT NULL DEFAULT 'pending',  -- 'pending'|'approved'|'rejected'|'expired'
  decided_by      JSONB,
  note            TEXT,
  expires_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  decided_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_approvals_tenant_status
  ON approvals (tenant_id, status);

CREATE INDEX IF NOT EXISTS idx_approvals_operation
  ON approvals (operation_id);

-- ─── idempotency_keys ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS idempotency_keys (
  tenant_id     TEXT        NOT NULL,
  key           TEXT        NOT NULL,
  operation_id  TEXT        NOT NULL,
  status        TEXT        NOT NULL,
  payload_hash  TEXT        NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at    TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (tenant_id, key)
);

CREATE INDEX IF NOT EXISTS idx_idempotency_expires
  ON idempotency_keys (expires_at);
