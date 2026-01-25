import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';

// Direct Postgres connection for integration tests
const TEST_CONFIG = {
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || '5432'),
  user: process.env.POSTGRES_USER || 'integrax',
  password: process.env.POSTGRES_PASSWORD || 'integrax',
  database: process.env.POSTGRES_DB || 'integrax',
};

describe('Audit Log Integration', () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = new Pool(TEST_CONFIG);

    // Create audit table if not exists
    await pool.query(`
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
    `);

    // Clean up test data
    await pool.query("DELETE FROM audit_logs WHERE tenant_id LIKE 'test-%'");
  });

  afterAll(async () => {
    // Clean up test data
    await pool.query("DELETE FROM audit_logs WHERE tenant_id LIKE 'test-%'");
    await pool.end();
  });

  it('should connect to Postgres', async () => {
    const result = await pool.query('SELECT NOW() as now');
    expect(result.rows[0].now).toBeDefined();
  });

  it('should insert audit log entry', async () => {
    const correlationId = crypto.randomUUID();
    const tenantId = 'test-tenant-001';

    await pool.query(
      `INSERT INTO audit_logs (
        tenant_id, user_id, user_role, correlation_id,
        action, resource_type, resource_id, result,
        details
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        tenantId,
        'user-123',
        'admin',
        correlationId,
        'order.processed',
        'order',
        'ORD-12345',
        'success',
        JSON.stringify({ items: 3, total: 15000 }),
      ]
    );

    const result = await pool.query(
      'SELECT * FROM audit_logs WHERE correlation_id = $1',
      [correlationId]
    );

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].tenant_id).toBe(tenantId);
    expect(result.rows[0].action).toBe('order.processed');
    expect(result.rows[0].result).toBe('success');
    expect(result.rows[0].details).toEqual({ items: 3, total: 15000 });
  });

  it('should query audit logs by tenant', async () => {
    const tenantId = 'test-tenant-002';
    const correlationId1 = crypto.randomUUID();
    const correlationId2 = crypto.randomUUID();

    // Insert two entries
    await pool.query(
      `INSERT INTO audit_logs (tenant_id, correlation_id, action, resource_type, resource_id, result)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [tenantId, correlationId1, 'invoice.created', 'invoice', 'INV-001', 'success']
    );

    await pool.query(
      `INSERT INTO audit_logs (tenant_id, correlation_id, action, resource_type, resource_id, result)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [tenantId, correlationId2, 'invoice.sent', 'invoice', 'INV-001', 'success']
    );

    const result = await pool.query(
      'SELECT * FROM audit_logs WHERE tenant_id = $1 ORDER BY created_at',
      [tenantId]
    );

    expect(result.rows.length).toBeGreaterThanOrEqual(2);
    expect(result.rows.map(r => r.action)).toContain('invoice.created');
    expect(result.rows.map(r => r.action)).toContain('invoice.sent');
  });

  it('should store failure result with error details', async () => {
    const correlationId = crypto.randomUUID();
    const tenantId = 'test-tenant-003';

    await pool.query(
      `INSERT INTO audit_logs (
        tenant_id, correlation_id, action, resource_type, resource_id, result, details
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        tenantId,
        correlationId,
        'payment.processed',
        'payment',
        'PAY-999',
        'failure',
        JSON.stringify({
          error: 'INSUFFICIENT_FUNDS',
          message: 'The card has insufficient funds',
          attempt: 2,
        }),
      ]
    );

    const result = await pool.query(
      'SELECT * FROM audit_logs WHERE correlation_id = $1',
      [correlationId]
    );

    expect(result.rows[0].result).toBe('failure');
    expect(result.rows[0].details.error).toBe('INSUFFICIENT_FUNDS');
  });

  it('should query by time range', async () => {
    const tenantId = 'test-tenant-004';
    const correlationId = crypto.randomUUID();

    await pool.query(
      `INSERT INTO audit_logs (tenant_id, correlation_id, action, resource_type, resource_id, result)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [tenantId, correlationId, 'test.action', 'test', 'TEST-001', 'success']
    );

    // Query last hour
    const result = await pool.query(
      `SELECT * FROM audit_logs
       WHERE tenant_id = $1
       AND timestamp > NOW() - INTERVAL '1 hour'`,
      [tenantId]
    );

    expect(result.rows.length).toBeGreaterThanOrEqual(1);
  });

  it('should support JSONB queries on details', async () => {
    const tenantId = 'test-tenant-005';
    const correlationId = crypto.randomUUID();

    await pool.query(
      `INSERT INTO audit_logs (tenant_id, correlation_id, action, resource_type, resource_id, result, details)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        tenantId,
        correlationId,
        'order.completed',
        'order',
        'ORD-555',
        'success',
        JSON.stringify({ paymentMethod: 'credit_card', installments: 3 }),
      ]
    );

    // Query by JSONB field
    const result = await pool.query(
      `SELECT * FROM audit_logs
       WHERE tenant_id = $1
       AND details->>'paymentMethod' = 'credit_card'`,
      [tenantId]
    );

    expect(result.rows.length).toBeGreaterThanOrEqual(1);
    expect(result.rows[0].details.installments).toBe(3);
  });
});
