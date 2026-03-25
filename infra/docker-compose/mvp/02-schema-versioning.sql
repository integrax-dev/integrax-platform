-- ============================================
-- Schema Versioning & Audit Trail
-- ============================================

-- 1. Schema Inventory: Store every unique fingerprint/definition found
CREATE TABLE IF NOT EXISTS schema_inventory (
    fingerprint TEXT PRIMARY KEY,
    schema_definition JSONB NOT NULL, -- Canonical SchemaField[]
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Connector Schema Versions: Track the history of a specific connector
CREATE TABLE IF NOT EXISTS connector_schema_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    connector_id VARCHAR(100) NOT NULL,
    tenant_id VARCHAR(100) NOT NULL,
    fingerprint TEXT NOT NULL REFERENCES schema_inventory(fingerprint),
    version_number INTEGER NOT NULL,
    metadata JSONB, -- { source: 'kafka', detected_at: '...' }
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(connector_id, tenant_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_csv_connector_tenant ON connector_schema_versions(connector_id, tenant_id);

-- 3. Schema Diff Reports: Audit Trail of comparisons (A vs B or V1 vs V2)
CREATE TABLE IF NOT EXISTS schema_diff_reports (
    id UUID PRIMARY KEY, -- ULID from similarity engine
    workflow_id VARCHAR(255),
    tenant_id VARCHAR(100) NOT NULL,
    source_connector_id VARCHAR(100) NOT NULL,
    target_connector_id VARCHAR(100) NOT NULL,
    source_fingerprint TEXT NOT NULL REFERENCES schema_inventory(fingerprint),
    target_fingerprint TEXT NOT NULL REFERENCES schema_inventory(fingerprint),
    has_differences BOOLEAN NOT NULL,
    diff_payload JSONB NOT NULL, -- El DiffResult completo
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE schema_diff_reports ADD COLUMN IF NOT EXISTS workflow_id VARCHAR(255);

CREATE INDEX IF NOT EXISTS idx_sdr_tenant_id ON schema_diff_reports(tenant_id);
CREATE INDEX IF NOT EXISTS idx_sdr_source_target ON schema_diff_reports(source_connector_id, target_connector_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_sdr_workflow_id ON schema_diff_reports(workflow_id) WHERE workflow_id IS NOT NULL;

-- 4. Sample Reservoir: rolling corpus of observed payloads per tenant + schema
CREATE TABLE IF NOT EXISTS schema_sample_reservoir (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(100) NOT NULL,
    schema_id VARCHAR(100) NOT NULL,
    sample_hash TEXT NOT NULL,
    sample_payload JSONB NOT NULL,
    captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(tenant_id, schema_id, sample_hash)
);

CREATE INDEX IF NOT EXISTS idx_ssr_tenant_schema_captured ON schema_sample_reservoir(tenant_id, schema_id, captured_at DESC);

-- 5. Mapping Memory: accepted historical rename mappings
CREATE TABLE IF NOT EXISTS schema_mapping_memory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(100) NOT NULL,
    source_connector_id VARCHAR(100) NOT NULL,
    target_connector_id VARCHAR(100) NOT NULL,
    source_path TEXT NOT NULL,
    target_path TEXT NOT NULL,
    accepted_count INTEGER NOT NULL DEFAULT 0,
    rejected_count INTEGER NOT NULL DEFAULT 0,
    average_confidence DOUBLE PRECISION NOT NULL DEFAULT 0,
    last_report_id UUID,
    last_accepted_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(tenant_id, source_connector_id, target_connector_id, source_path, target_path)
);

CREATE INDEX IF NOT EXISTS idx_smm_connector_pair ON schema_mapping_memory(tenant_id, source_connector_id, target_connector_id);
