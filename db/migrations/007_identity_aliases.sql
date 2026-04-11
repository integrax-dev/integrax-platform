-- --- Migracion 007: Identity aliases ----------------------------------------
-- Mapeo persistente canonical_id ↔ (system, external_id) para el IdentityResolver.
-- Permite reconstruir el resolver sin re-escanear todos los snapshots.

CREATE TABLE IF NOT EXISTS identity_aliases (
  id            TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id     TEXT        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  canonical_id  TEXT        NOT NULL,                  -- ulid asignado por la plataforma
  source_system TEXT        NOT NULL,                  -- conector: 'mercadopago', 'contabilium', ...
  external_id   TEXT        NOT NULL,                  -- ID tal como lo reporta ese sistema
  entity_type   TEXT        NOT NULL,                  -- 'product' | 'order' | 'invoice' | ...
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_identity_alias UNIQUE (tenant_id, source_system, external_id, entity_type)
);

CREATE INDEX IF NOT EXISTS idx_aliases_canonical
  ON identity_aliases (tenant_id, canonical_id);

CREATE INDEX IF NOT EXISTS idx_aliases_system_ext
  ON identity_aliases (tenant_id, source_system, external_id);

CREATE INDEX IF NOT EXISTS idx_aliases_entity_type
  ON identity_aliases (tenant_id, entity_type);
