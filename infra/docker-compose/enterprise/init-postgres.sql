-- ============================================
-- INTEGRAX ENTERPRISE - PostgreSQL Init
-- ============================================

-- Create schemas
CREATE SCHEMA IF NOT EXISTS integrax;

-- Audit logs table (from MVP)
CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGSERIAL PRIMARY KEY,
  event_id UUID NOT NULL,
  event_type VARCHAR(100) NOT NULL,
  tenant_id VARCHAR(100) NOT NULL,
  correlation_id UUID NOT NULL,
  payload JSONB NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  error_message TEXT,
  retry_count INT NOT NULL DEFAULT 0
);

-- Indexes for audit_logs
CREATE INDEX IF NOT EXISTS idx_audit_logs_event_type ON audit_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_id ON audit_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_correlation_id ON audit_logs(correlation_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_status ON audit_logs(status);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);

-- ============================================
-- CDC Tables (for Debezium)
-- ============================================

-- Payments table (synced via Debezium to Kafka)
CREATE TABLE IF NOT EXISTS payments (
  id BIGSERIAL PRIMARY KEY,
  external_id VARCHAR(100) UNIQUE NOT NULL,
  tenant_id VARCHAR(100) NOT NULL,
  amount DECIMAL(15, 2) NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'ARS',
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  provider VARCHAR(50) NOT NULL,
  provider_payment_id VARCHAR(100),
  payer_email VARCHAR(255),
  payer_name VARCHAR(255),
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payments_tenant_id ON payments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_created_at ON payments(created_at);
CREATE INDEX IF NOT EXISTS idx_payments_external_id ON payments(external_id);

-- Orders table (synced via Debezium to Kafka)
CREATE TABLE IF NOT EXISTS orders (
  id BIGSERIAL PRIMARY KEY,
  external_id VARCHAR(100) UNIQUE NOT NULL,
  tenant_id VARCHAR(100) NOT NULL,
  customer_email VARCHAR(255) NOT NULL,
  customer_name VARCHAR(255),
  total_amount DECIMAL(15, 2) NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'ARS',
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  payment_id BIGINT REFERENCES payments(id),
  items JSONB NOT NULL DEFAULT '[]',
  shipping_address JSONB,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orders_tenant_id ON orders(tenant_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_customer_email ON orders(customer_email);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);

-- Invoices table (synced via Debezium to Kafka)
CREATE TABLE IF NOT EXISTS invoices (
  id BIGSERIAL PRIMARY KEY,
  external_id VARCHAR(100) UNIQUE NOT NULL,
  tenant_id VARCHAR(100) NOT NULL,
  order_id BIGINT REFERENCES orders(id),
  invoice_number VARCHAR(50) NOT NULL,
  customer_email VARCHAR(255) NOT NULL,
  customer_name VARCHAR(255),
  customer_tax_id VARCHAR(20),
  total_amount DECIMAL(15, 2) NOT NULL,
  tax_amount DECIMAL(15, 2) NOT NULL DEFAULT 0,
  currency VARCHAR(3) NOT NULL DEFAULT 'ARS',
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  afip_cae VARCHAR(20),
  afip_cae_expiration DATE,
  issued_at TIMESTAMPTZ,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invoices_tenant_id ON invoices(tenant_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_invoice_number ON invoices(invoice_number);
CREATE INDEX IF NOT EXISTS idx_invoices_created_at ON invoices(created_at);

-- ============================================
-- Outbox Pattern Table (for reliable messaging)
-- ============================================
CREATE TABLE IF NOT EXISTS outbox (
  id BIGSERIAL PRIMARY KEY,
  aggregate_type VARCHAR(100) NOT NULL,
  aggregate_id VARCHAR(100) NOT NULL,
  event_type VARCHAR(100) NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_outbox_published ON outbox(published_at) WHERE published_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_outbox_aggregate ON outbox(aggregate_type, aggregate_id);

-- ============================================
-- Trigger for updated_at
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_payments_updated_at
    BEFORE UPDATE ON payments
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_orders_updated_at
    BEFORE UPDATE ON orders
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_invoices_updated_at
    BEFORE UPDATE ON invoices
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- Publication for Debezium CDC
-- ============================================
CREATE PUBLICATION integrax_cdc FOR TABLE payments, orders, invoices, outbox;

-- Grant replication permissions
ALTER USER integrax WITH REPLICATION;
