import { Pool } from 'pg';
import { config } from './config.js';
import { createLogger } from './logger.js';

const logger = createLogger('audit');

export interface AuditLogEntry {
  tenantId: string;
  userId?: string;
  userRole?: string;
  correlationId: string;
  action: string;
  resourceType: string;
  resourceId: string;
  result: 'success' | 'failure';
  details?: Record<string, unknown>;
  ipAddress?: string;
}

export interface AuditLogger {
  log(entry: AuditLogEntry): Promise<void>;
  close(): Promise<void>;
}

export async function createAuditLogger(): Promise<AuditLogger> {
  const pool = new Pool({
    host: config.POSTGRES_HOST,
    port: config.POSTGRES_PORT,
    user: config.POSTGRES_USER,
    password: config.POSTGRES_PASSWORD,
    database: config.POSTGRES_DB,
    max: 10,
  });

  // Ensure audit table exists
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
    CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
  `);

  logger.info('Audit logger initialized');

  return {
    async log(entry: AuditLogEntry): Promise<void> {
      try {
        await pool.query(
          `INSERT INTO audit_logs (
            tenant_id, user_id, user_role, correlation_id,
            action, resource_type, resource_id, result,
            details, ip_address
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [
            entry.tenantId,
            entry.userId ?? null,
            entry.userRole ?? null,
            entry.correlationId,
            entry.action,
            entry.resourceType,
            entry.resourceId,
            entry.result,
            entry.details ? JSON.stringify(entry.details) : null,
            entry.ipAddress ?? null,
          ]
        );

        logger.debug({
          action: entry.action,
          resourceType: entry.resourceType,
          resourceId: entry.resourceId,
          result: entry.result,
        }, 'Audit log written');
      } catch (error) {
        logger.error({
          error: error instanceof Error ? error.message : String(error),
          entry,
        }, 'Failed to write audit log');
        // Don't throw - audit logging failure shouldn't break the main flow
      }
    },

    async close(): Promise<void> {
      await pool.end();
      logger.info('Audit logger closed');
    },
  };
}
