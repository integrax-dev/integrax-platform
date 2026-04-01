-- ============================================================
-- Migration 002: schema_mapping_memory — channel_hits JSONB
-- ============================================================
-- Agrega column channel_hits para tracking de qué canal de evidencia
-- fue dominante en cada mapping aceptado. Alimenta computeSignalWeights()
-- para derivar multiplicadores adaptativos por par de conectores.
--
-- Seguro re-ejecutar: usa ADD COLUMN IF NOT EXISTS.

ALTER TABLE schema_mapping_memory
  ADD COLUMN IF NOT EXISTS channel_hits JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Índice GIN para consultas por canal específico (e.g. WHERE channel_hits ? 'value').
CREATE INDEX IF NOT EXISTS idx_smm_channel_hits
  ON schema_mapping_memory USING GIN (channel_hits);
