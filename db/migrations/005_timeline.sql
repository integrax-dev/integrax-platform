-- --- Migracion 005: Timeline store ------------------------------------------
-- Registro append-only de trazas: entity, sync, conflict, workflow, operation.
-- Indexado por tenant + kind para queries de auditoría y debugging.

CREATE TABLE IF NOT EXISTS timeline_entries (
  id            TEXT        PRIMARY KEY,               -- ulid
  kind          TEXT        NOT NULL,                  -- 'entity'|'sync'|'conflict'|'workflow'|'operation'
  tenant_id     TEXT        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  entity_type   TEXT,                                  -- presente en kind=entity/sync/conflict
  entity_id     TEXT,                                  -- canonical_id
  occurred_at   TIMESTAMPTZ NOT NULL,
  recorded_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  data          JSONB       NOT NULL,                  -- payload completo (varía por kind)
  note          TEXT                                   -- mensaje libre opcional
);

CREATE INDEX IF NOT EXISTS idx_timeline_tenant_kind
  ON timeline_entries (tenant_id, kind);

CREATE INDEX IF NOT EXISTS idx_timeline_tenant_entity
  ON timeline_entries (tenant_id, entity_type, entity_id)
  WHERE entity_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_timeline_occurred_at
  ON timeline_entries (tenant_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_timeline_recorded_at
  ON timeline_entries (recorded_at DESC);
