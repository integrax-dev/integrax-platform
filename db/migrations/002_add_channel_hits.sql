ALTER TABLE IF EXISTS schema_mapping_memory
  ADD COLUMN IF NOT EXISTS channel_hits JSONB DEFAULT '{}'::jsonb;
