-- ────────────────────────────────────────────────────────────────────────────
-- 019_consistency_control_plane.sql
-- Consistency Control Plane: tolerance policies, authority rules, behavior
-- intents, consistency signals, cases, timeline events, mapping governance
-- ────────────────────────────────────────────────────────────────────────────

-- ─── Tolerance policies ───────────────────────────────────────────────────────

CREATE TABLE tolerance_policies (
  id              TEXT PRIMARY KEY,
  tenant_id       TEXT REFERENCES tenants(id) ON DELETE CASCADE,
  entity_type     TEXT,
  field           TEXT,
  connector_a     TEXT,
  connector_b     TEXT,
  strategy        TEXT NOT NULL CHECK (strategy IN ('absolute','relative','percentage','exact','always_pass')),
  value           DOUBLE PRECISION NOT NULL DEFAULT 0,
  unit            TEXT,
  priority        INTEGER NOT NULL DEFAULT 0,
  enabled         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tolerance_tenant     ON tolerance_policies(tenant_id);
CREATE INDEX idx_tolerance_entity     ON tolerance_policies(entity_type);

-- ─── Authority rules ─────────────────────────────────────────────────────────

CREATE TABLE authority_rules (
  id                   TEXT PRIMARY KEY,
  tenant_id            TEXT REFERENCES tenants(id) ON DELETE CASCADE,
  entity_type          TEXT,
  field                TEXT,
  connector_a          TEXT,
  connector_b          TEXT,
  mode                 TEXT NOT NULL CHECK (mode IN (
                         'observe_only','suggest','auto_accept',
                         'prefer_a','prefer_b','latest_wins',
                         'highest_value','manual_resolution'
                       )),
  authority_connector  TEXT,
  priority             INTEGER NOT NULL DEFAULT 0,
  approved_by          TEXT,
  enabled              BOOLEAN NOT NULL DEFAULT TRUE,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_authority_tenant ON authority_rules(tenant_id);

-- ─── Connector trust scores ───────────────────────────────────────────────────

CREATE TABLE connector_trust_scores (
  id               TEXT PRIMARY KEY,
  tenant_id        TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  connector_id     TEXT NOT NULL,
  entity_type      TEXT,
  score            DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  accepted_count   INTEGER NOT NULL DEFAULT 0,
  rejected_count   INTEGER NOT NULL DEFAULT 0,
  correction_count INTEGER NOT NULL DEFAULT 0,
  last_updated     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_trust_tenant_connector_entity UNIQUE (tenant_id, connector_id, entity_type)
);

CREATE INDEX idx_trust_tenant ON connector_trust_scores(tenant_id);

-- ─── Behavior intents ─────────────────────────────────────────────────────────

CREATE TABLE behavior_intents (
  id                   TEXT PRIMARY KEY,
  tenant_id            TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  when_trigger         TEXT NOT NULL CHECK (when_trigger IN (
                         'entity.created','entity.updated','field.changed','conflict.detected'
                       )),
  entity_type          TEXT NOT NULL,
  field                TEXT,
  connectors           TEXT[] NOT NULL,
  propagation          TEXT NOT NULL CHECK (propagation IN (
                         'mirror','adjust','derive','lock','ignore','approve'
                       )),
  divergence_mode      TEXT NOT NULL CHECK (divergence_mode IN (
                         'strict_sync','channel_adjusted','bidirectional_sync',
                         'manual_resolution','regulatory_locked','observe_only'
                       )),
  authority_connector  TEXT,
  tolerance_strategy   TEXT,
  tolerance_value      DOUBLE PRECISION,
  tolerance_unit       TEXT,
  country              TEXT,
  enabled              BOOLEAN NOT NULL DEFAULT TRUE,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_intent_tenant ON behavior_intents(tenant_id);
CREATE INDEX idx_intent_entity ON behavior_intents(entity_type);

-- ─── Consistency signals ──────────────────────────────────────────────────────

CREATE TABLE consistency_signals (
  id                 TEXT PRIMARY KEY,
  tenant_id          TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  kind               TEXT NOT NULL,
  severity           TEXT NOT NULL CHECK (severity IN ('INFO','LOW','MEDIUM','HIGH','CRITICAL')),
  entity_type        TEXT NOT NULL,
  entity_id          TEXT,
  connector_a        TEXT NOT NULL,
  connector_b        TEXT,
  field_path         TEXT,
  tags               JSONB NOT NULL DEFAULT '{}',
  deduplication_key  TEXT NOT NULL,
  occurred_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at        TIMESTAMPTZ,
  case_id            TEXT
);

CREATE INDEX idx_signal_tenant   ON consistency_signals(tenant_id);
CREATE INDEX idx_signal_entity   ON consistency_signals(tenant_id, entity_type, entity_id);
CREATE INDEX idx_signal_dedup    ON consistency_signals(deduplication_key, occurred_at);
CREATE INDEX idx_signal_case     ON consistency_signals(case_id);

-- ─── Consistency cases ────────────────────────────────────────────────────────

CREATE TABLE consistency_cases (
  id           TEXT PRIMARY KEY,
  tenant_id    TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  entity_type  TEXT NOT NULL,
  entity_id    TEXT,
  title        TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'open' CHECK (status IN (
                 'open','investigating','resolved','wont_fix','suppressed'
               )),
  severity     TEXT NOT NULL CHECK (severity IN ('INFO','LOW','MEDIUM','HIGH','CRITICAL')),
  assigned_to  TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at  TIMESTAMPTZ
);

CREATE INDEX idx_case_tenant  ON consistency_cases(tenant_id);
CREATE INDEX idx_case_entity  ON consistency_cases(tenant_id, entity_type, entity_id);
CREATE INDEX idx_case_status  ON consistency_cases(tenant_id, status);

ALTER TABLE consistency_signals ADD CONSTRAINT fk_signal_case
  FOREIGN KEY (case_id) REFERENCES consistency_cases(id) ON DELETE SET NULL;

-- ─── Consistency timeline ─────────────────────────────────────────────────────

CREATE TABLE consistency_timeline (
  id           TEXT PRIMARY KEY,
  case_id      TEXT NOT NULL REFERENCES consistency_cases(id) ON DELETE CASCADE,
  tenant_id    TEXT NOT NULL,
  kind         TEXT NOT NULL,
  actor        TEXT,
  description  TEXT NOT NULL,
  meta         JSONB NOT NULL DEFAULT '{}',
  occurred_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sensitive    BOOLEAN NOT NULL DEFAULT FALSE CHECK (sensitive = FALSE)
);

CREATE INDEX idx_timeline_case ON consistency_timeline(case_id, occurred_at);

-- ─── Mapping governance ───────────────────────────────────────────────────────

CREATE TABLE mapping_governance (
  id               TEXT PRIMARY KEY,
  tenant_id        TEXT REFERENCES tenants(id) ON DELETE CASCADE,
  connector_a_id   TEXT NOT NULL,
  connector_b_id   TEXT NOT NULL,
  source_path      TEXT NOT NULL,
  target_path      TEXT NOT NULL,
  entity_type      TEXT,
  state            TEXT NOT NULL DEFAULT 'candidate' CHECK (state IN (
                     'candidate','validated','trusted','ground_truth','deprecated'
                   )),
  confidence       DOUBLE PRECISION NOT NULL DEFAULT 0,
  accepted_count   INTEGER NOT NULL DEFAULT 0,
  rejected_count   INTEGER NOT NULL DEFAULT 0,
  correction_count INTEGER NOT NULL DEFAULT 0,
  approved_by      TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_mapping UNIQUE (tenant_id, connector_a_id, connector_b_id, source_path, target_path)
);

CREATE INDEX idx_mapping_tenant      ON mapping_governance(tenant_id);
CREATE INDEX idx_mapping_connectors  ON mapping_governance(connector_a_id, connector_b_id);
CREATE INDEX idx_mapping_state       ON mapping_governance(state);
