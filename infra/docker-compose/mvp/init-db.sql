-- Create n8n database
CREATE DATABASE n8n;

-- Create audit_logs table in main database
\c integrax;

CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    tenant_id VARCHAR(255) NOT NULL,
    user_id VARCHAR(255),
    user_role VARCHAR(100),
    correlation_id UUID NOT NULL,
    action VARCHAR(255) NOT NULL,
    resource_type VARCHAR(100) NOT NULL,
    resource_id VARCHAR(255) NOT NULL,
    result VARCHAR(20) NOT NULL,
    details JSONB,
    ip_address INET,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_id ON audit_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_correlation_id ON audit_logs(correlation_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);

-- Create connections table for managing connector configurations
CREATE TABLE IF NOT EXISTS connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    connector_id VARCHAR(100) NOT NULL,
    tenant_id VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    credentials_ref VARCHAR(500) NOT NULL,
    config JSONB,
    last_test_at TIMESTAMPTZ,
    last_test_status VARCHAR(20),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_connections_tenant_id ON connections(tenant_id);
CREATE INDEX IF NOT EXISTS idx_connections_connector_id ON connections(connector_id);

-- Create runs table for tracking workflow executions
CREATE TABLE IF NOT EXISTS runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_type VARCHAR(100) NOT NULL,
    tenant_id VARCHAR(255) NOT NULL,
    correlation_id UUID NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    input JSONB,
    output JSONB,
    error_message TEXT,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    duration_ms INTEGER,
    retries INTEGER DEFAULT 0,
    parent_run_id UUID REFERENCES runs(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_runs_tenant_id ON runs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_runs_correlation_id ON runs(correlation_id);
CREATE INDEX IF NOT EXISTS idx_runs_status ON runs(status);
CREATE INDEX IF NOT EXISTS idx_runs_workflow_type ON runs(workflow_type);
CREATE INDEX IF NOT EXISTS idx_runs_started_at ON runs(started_at);

-- Create run_steps table for tracking individual steps
CREATE TABLE IF NOT EXISTS run_steps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id UUID NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
    step_id VARCHAR(100) NOT NULL,
    name VARCHAR(255) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    duration_ms INTEGER,
    retries INTEGER DEFAULT 0,
    error_code VARCHAR(100),
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_run_steps_run_id ON run_steps(run_id);

-- Create dlq table for dead letter queue
CREATE TABLE IF NOT EXISTS dlq (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    queue_name VARCHAR(100) NOT NULL,
    original_event_type VARCHAR(255),
    tenant_id VARCHAR(255) NOT NULL,
    correlation_id UUID,
    payload JSONB NOT NULL,
    error_code VARCHAR(100),
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    failed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reprocessed_at TIMESTAMPTZ,
    discarded_at TIMESTAMPTZ,
    discard_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dlq_tenant_id ON dlq(tenant_id);
CREATE INDEX IF NOT EXISTS idx_dlq_queue_name ON dlq(queue_name);
CREATE INDEX IF NOT EXISTS idx_dlq_failed_at ON dlq(failed_at);
