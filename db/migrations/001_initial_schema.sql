-- ============================================================
-- Migración 001 — Schema inicial
-- Ejecutar una vez contra la base de datos de cada entorno.
-- Compatible con Postgres 14+.
-- ============================================================

-- ─── Extensiones ─────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS "pgcrypto"; -- gen_random_uuid()

-- ─── Tenants ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS tenants (
  id             TEXT        PRIMARY KEY,
  name           TEXT        NOT NULL,
  plan           TEXT        NOT NULL DEFAULT 'free',
  status         TEXT        NOT NULL DEFAULT 'pending',
  owner_id       TEXT        NOT NULL,
  limits         JSONB       NOT NULL DEFAULT '{}',
  metadata       JSONB       NOT NULL DEFAULT '{}',
  api_key_hash   TEXT,
  webhook_secret TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tenants_status ON tenants (status);
CREATE INDEX IF NOT EXISTS idx_tenants_plan   ON tenants (plan);

-- ─── Conectores por tenant ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS tenant_connectors (
  id               TEXT        PRIMARY KEY,
  tenant_id        TEXT        NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  connector_id     TEXT        NOT NULL,
  status           TEXT        NOT NULL DEFAULT 'configured',
  credentials      JSONB       NOT NULL DEFAULT '{}',
  last_tested_at   TIMESTAMPTZ,
  last_test_result TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Clave única natural: un tenant no puede tener dos instancias del mismo conector.
  -- saveTenantConnector usa ON CONFLICT (tenant_id, connector_id) para upserts seguros.
  CONSTRAINT uq_tenant_connector UNIQUE (tenant_id, connector_id)
);

CREATE INDEX IF NOT EXISTS idx_tenant_connectors_tenant ON tenant_connectors (tenant_id);

-- ─── Audit log ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS audit_logs (
  id             BIGSERIAL   PRIMARY KEY,
  tenant_id      TEXT,
  correlation_id TEXT,
  action         TEXT        NOT NULL,
  resource_type  TEXT,
  resource_id    TEXT,
  result         TEXT        NOT NULL DEFAULT 'success',
  details        JSONB,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant     ON audit_logs (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action     ON audit_logs (action, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource   ON audit_logs (resource_type, resource_id);

-- ─── Reportes de schema diff ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS schema_diff_reports (
  id                   TEXT        PRIMARY KEY,
  tenant_id            TEXT        NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  workflow_id          TEXT        NOT NULL,
  source_connector_id  TEXT        NOT NULL,
  target_connector_id  TEXT        NOT NULL,
  diff_payload         JSONB       NOT NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_schema_diff_reports_tenant      ON schema_diff_reports (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_schema_diff_reports_workflow_id ON schema_diff_reports (workflow_id);

-- ─── Memoria de feedback de mappings ─────────────────────────────────────────
-- Cada fila representa el historial acumulado de decisiones (accept/reject)
-- de un operador sobre un par de campos de dos conectores.

CREATE TABLE IF NOT EXISTS schema_mapping_memory (
  id                   BIGSERIAL   PRIMARY KEY,
  tenant_id            TEXT        NOT NULL,
  source_connector_id  TEXT        NOT NULL,
  target_connector_id  TEXT        NOT NULL,
  source_path          TEXT        NOT NULL,
  target_path          TEXT        NOT NULL,
  accepted_count       INTEGER     NOT NULL DEFAULT 0,
  rejected_count       INTEGER     NOT NULL DEFAULT 0,
  average_confidence   NUMERIC(5,4) NOT NULL DEFAULT 0,
  last_accepted_at     TIMESTAMPTZ,
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Clave única natural: un par de rutas por tenant + par de conectores.
  -- upsertEntry usa ON CONFLICT sobre este constraint para actualizaciones atómicas.
  CONSTRAINT uq_mapping_memory UNIQUE (
    tenant_id,
    source_connector_id,
    target_connector_id,
    source_path,
    target_path
  )
);

-- Índice compuesto para loadMappingMemory: convierte el SELECT de O(n) a O(log n).
-- Sin este índice, cada llamada a compare() hace full-scan de la tabla.
CREATE INDEX IF NOT EXISTS idx_mapping_memory_lookup
  ON schema_mapping_memory (tenant_id, source_connector_id, target_connector_id);

-- Índice para pruneMemory: filtro por tenant + updated_at para el criterio de antigüedad.
CREATE INDEX IF NOT EXISTS idx_mapping_memory_prune
  ON schema_mapping_memory (tenant_id, updated_at);
