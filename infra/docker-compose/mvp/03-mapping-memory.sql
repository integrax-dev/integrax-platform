-- ============================================================
-- Migration 03: schema_mapping_memory — ajustes adicionales
-- ============================================================
-- Agrega created_at a schema_mapping_memory (no estaba en la definición original).
-- Seguro re-ejecutar: usa ADD COLUMN IF NOT EXISTS.

ALTER TABLE schema_mapping_memory
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE schema_mapping_memory
  ADD COLUMN IF NOT EXISTS channel_hits JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Índice para consultas de inspección ordenadas por actividad reciente.
CREATE INDEX IF NOT EXISTS idx_smm_updated_at
  ON schema_mapping_memory(tenant_id, updated_at DESC);

-- Índice para el endpoint GET /api/schemas/memory (orden por feedback total desc).
CREATE INDEX IF NOT EXISTS idx_smm_total_feedback
  ON schema_mapping_memory(tenant_id, source_connector_id, target_connector_id,
    (accepted_count + rejected_count) DESC);
