-- --- Migracion 004: Snapshot store de entidades -----------------------------
-- Guarda el ultimo estado canonico conocido de cada entidad por sistema origen.
-- Se usa para detectar drift, reconciliar y reconstruir la linea temporal.

CREATE TABLE IF NOT EXISTS entity_snapshots (
  snapshot_id         TEXT        PRIMARY KEY,               -- ulid
  tenant_id           TEXT        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  entity_type         TEXT        NOT NULL,                  -- 'product' | 'order' | 'invoice' | ...
  canonical_id        TEXT        NOT NULL,                  -- ID estable de la plataforma (ulid)
  source_system       TEXT        NOT NULL,                  -- conector propietario de este snapshot
  external_ids        JSONB       NOT NULL DEFAULT '[]',     -- [{system, id}, ...]
  payload_hash        TEXT        NOT NULL,                  -- SHA-256 del payload normalizado
  payload             JSONB       NOT NULL,                  -- payload canonico completo de la entidad
  updated_at_source   TIMESTAMPTZ NOT NULL,                  -- timestamp informado por el sistema origen
  updated_at_snapshot TIMESTAMPTZ NOT NULL DEFAULT NOW(),    -- momento en que capturamos este snapshot
  CONSTRAINT uq_entity_snapshot UNIQUE (tenant_id, entity_type, canonical_id, source_system)
);

CREATE INDEX IF NOT EXISTS idx_snapshots_tenant_type
  ON entity_snapshots (tenant_id, entity_type);

CREATE INDEX IF NOT EXISTS idx_snapshots_canonical
  ON entity_snapshots (tenant_id, entity_type, canonical_id);

CREATE INDEX IF NOT EXISTS idx_snapshots_source_system
  ON entity_snapshots (tenant_id, entity_type, source_system);

CREATE INDEX IF NOT EXISTS idx_snapshots_updated_at_snapshot
  ON entity_snapshots (updated_at_snapshot DESC);

-- --- Historial de snapshots (log append-only opcional) ----------------------
-- Conserva cada version para reconstruccion temporal. En produccion conviene
-- particionarlo por mes si el volumen es alto.

CREATE TABLE IF NOT EXISTS entity_snapshot_history (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id         TEXT        NOT NULL,                  -- referencia a entity_snapshots.snapshot_id
  tenant_id           TEXT        NOT NULL,
  entity_type         TEXT        NOT NULL,
  canonical_id        TEXT        NOT NULL,
  source_system       TEXT        NOT NULL,
  payload_hash        TEXT        NOT NULL,
  payload             JSONB       NOT NULL,
  captured_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_snapshot_history_canonical
  ON entity_snapshot_history (tenant_id, entity_type, canonical_id, captured_at DESC);
