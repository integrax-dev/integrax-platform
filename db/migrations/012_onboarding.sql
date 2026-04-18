-- Users table (platform users with email/password login)
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'viewer',
  tenant_id     TEXT REFERENCES tenants(id) ON DELETE SET NULL,
  password_hash TEXT NOT NULL,
  last_login_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_users_email    ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_tenant   ON users(tenant_id);

-- Signup verification tokens
CREATE TABLE IF NOT EXISTS email_verifications (
  id           TEXT PRIMARY KEY,
  email        TEXT NOT NULL,
  token_hash   TEXT NOT NULL UNIQUE,
  name         TEXT NOT NULL,
  plan         TEXT NOT NULL DEFAULT 'free',
  expires_at   TIMESTAMPTZ NOT NULL,
  used_at      TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_email_verif_email ON email_verifications(email);

-- Password reset tokens
CREATE TABLE IF NOT EXISTS password_resets (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL,
  token_hash   TEXT NOT NULL UNIQUE,
  expires_at   TIMESTAMPTZ NOT NULL,
  used_at      TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- API credits ledger
CREATE TABLE IF NOT EXISTS api_credits (
  id           TEXT PRIMARY KEY,
  tenant_id    TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  delta        BIGINT NOT NULL,          -- positive = credit, negative = debit
  balance_after BIGINT NOT NULL,
  reason       TEXT NOT NULL,           -- 'purchase', 'api_call', 'bonus', 'refund'
  ref_id       TEXT,                    -- external payment ID or job ID
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_api_credits_tenant ON api_credits(tenant_id, created_at DESC);

-- Current balance view
CREATE TABLE IF NOT EXISTS api_credit_balances (
  tenant_id    TEXT PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  balance      BIGINT NOT NULL DEFAULT 0,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Storage usage tracking
CREATE TABLE IF NOT EXISTS storage_usage (
  tenant_id         TEXT PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  used_bytes        BIGINT NOT NULL DEFAULT 0,
  limit_bytes       BIGINT NOT NULL DEFAULT 1073741824,  -- 1 GB default
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Plan limits table (authoritative)
CREATE TABLE IF NOT EXISTS plan_limits (
  plan                TEXT PRIMARY KEY,
  events_per_month    BIGINT NOT NULL,
  api_calls_per_month BIGINT NOT NULL,
  storage_bytes       BIGINT NOT NULL,
  connectors_max      INT NOT NULL,
  workflows_max       INT NOT NULL,
  users_max           INT NOT NULL,
  price_usd_month     NUMERIC(10,2) NOT NULL
);

INSERT INTO plan_limits VALUES
  ('free',         100000,     10000,    1073741824,    1,   3,   1,   0.00),
  ('starter',      5000000,   500000,    5368709120,    5,  10,   3,  29.00),
  ('professional', 50000000,  5000000,  53687091200,   20,  50,  10,  99.00),
  ('enterprise',   999999999, 99999999, 536870912000,  100, 500, 100, 299.00)
ON CONFLICT (plan) DO NOTHING;
