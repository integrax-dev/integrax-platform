import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Queue, Worker, Job } from 'bullmq';
import { Redis } from 'ioredis';
import { Pool } from 'pg';

/**
 * End-to-end integration test for the MVP workflow:
 * order.paid event -> worker processing -> audit log -> invoice.issued event
 */

const REDIS_CONFIG = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD || undefined,
};

const POSTGRES_CONFIG = {
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || '5432'),
  user: process.env.POSTGRES_USER || 'integrax',
  password: process.env.POSTGRES_PASSWORD || 'integrax',
  database: process.env.POSTGRES_DB || 'integrax',
};

const E2E_QUEUE_NAME = 'integrax-e2e-test';

interface OrderPaidEvent {
  eventId: string;
  eventType: 'business.order.paid';
  tenantId: string;
  correlationId: string;
  occurredAt: string;
  source: string;
  payload: {
    order_id: string;
    payment_id: string;
    amount: number;
    currency: string;
    customer: {
      id: string;
      email: string;
      name: string;
    };
    items: Array<{
      sku: string;
      title: string;
      quantity: number;
      unit_price: number;
    }>;
  };
}

interface InvoiceIssuedEvent {
  eventId: string;
  eventType: 'business.invoice.issued';
  tenantId: string;
  correlationId: string;
  occurredAt: string;
  source: string;
  payload: {
    invoice_id: string;
    invoice_number: string;
    order_id: string;
    total_amount: number;
    customer_id: string;
  };
}

describe('End-to-End Integration', () => {
  let redis: Redis;
  let pool: Pool;
  let inputQueue: Queue<OrderPaidEvent>;
  let outputQueue: Queue<InvoiceIssuedEvent>;
  let worker: Worker<OrderPaidEvent> | null = null;

  beforeAll(async () => {
    // Initialize connections
    redis = new Redis({
      ...REDIS_CONFIG,
      maxRetriesPerRequest: null,
    });

    pool = new Pool(POSTGRES_CONFIG);

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
    `);

    // Initialize queues
    inputQueue = new Queue<OrderPaidEvent>(`${E2E_QUEUE_NAME}-input`, {
      connection: redis,
    });

    outputQueue = new Queue<InvoiceIssuedEvent>(`${E2E_QUEUE_NAME}-output`, {
      connection: redis,
    });

    // Clean up
    await inputQueue.obliterate({ force: true });
    await outputQueue.obliterate({ force: true });
    await pool.query("DELETE FROM audit_logs WHERE tenant_id LIKE 'e2e-test-%'");
  });

  afterAll(async () => {
    if (worker) {
      await worker.close();
    }
    await inputQueue.obliterate({ force: true });
    await outputQueue.obliterate({ force: true });
    await inputQueue.close();
    await outputQueue.close();
    await pool.query("DELETE FROM audit_logs WHERE tenant_id LIKE 'e2e-test-%'");
    await pool.end();
    await redis.quit();
  });

  it('should process order.paid and emit invoice.issued', async () => {
    const correlationId = crypto.randomUUID();
    const tenantId = 'e2e-test-tenant-001';
    const orderId = 'ORD-E2E-001';

    // Track emitted events
    const emittedEvents: InvoiceIssuedEvent[] = [];

    // Create worker that simulates the order-to-invoice flow
    worker = new Worker<OrderPaidEvent>(
      `${E2E_QUEUE_NAME}-input`,
      async (job: Job<OrderPaidEvent>) => {
        const event = job.data;

        // 1. Log audit entry for processing start
        await pool.query(
          `INSERT INTO audit_logs (tenant_id, correlation_id, action, resource_type, resource_id, result, details)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            event.tenantId,
            event.correlationId,
            'order.processing_started',
            'order',
            event.payload.order_id,
            'success',
            JSON.stringify({ paymentId: event.payload.payment_id }),
          ]
        );

        // 2. Simulate invoice creation
        const invoiceNumber = `FC-A-0003-${String(Date.now()).slice(-8)}`;
        const invoiceId = `INV-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;

        // 3. Create invoice.issued event
        const invoiceEvent: InvoiceIssuedEvent = {
          eventId: crypto.randomUUID(),
          eventType: 'business.invoice.issued',
          tenantId: event.tenantId,
          correlationId: event.correlationId, // Same correlation for traceability
          occurredAt: new Date().toISOString(),
          source: 'worker',
          payload: {
            invoice_id: invoiceId,
            invoice_number: invoiceNumber,
            order_id: event.payload.order_id,
            total_amount: event.payload.amount,
            customer_id: event.payload.customer.id,
          },
        };

        // 4. Emit to output queue
        await outputQueue.add('invoice.issued', invoiceEvent);
        emittedEvents.push(invoiceEvent);

        // 5. Log audit entry for completion
        await pool.query(
          `INSERT INTO audit_logs (tenant_id, correlation_id, action, resource_type, resource_id, result, details)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            event.tenantId,
            event.correlationId,
            'invoice.created',
            'invoice',
            invoiceId,
            'success',
            JSON.stringify({
              invoiceNumber,
              orderId: event.payload.order_id,
              amount: event.payload.amount,
            }),
          ]
        );

        return {
          success: true,
          invoiceId,
          invoiceNumber,
        };
      },
      { connection: redis }
    );

    // Create order.paid event (simulating MercadoPago webhook)
    const orderPaidEvent: OrderPaidEvent = {
      eventId: crypto.randomUUID(),
      eventType: 'business.order.paid',
      tenantId,
      correlationId,
      occurredAt: new Date().toISOString(),
      source: 'mercadopago',
      payload: {
        order_id: orderId,
        payment_id: 'PAY-12345678901',
        amount: 15000,
        currency: 'ARS',
        customer: {
          id: 'CUST-001',
          email: 'juan@example.com',
          name: 'Juan Pérez',
        },
        items: [
          {
            sku: 'SKU-WIDGET-001',
            title: 'Widget Premium',
            quantity: 2,
            unit_price: 7500,
          },
        ],
      },
    };

    // Enqueue the event
    await inputQueue.add('order.paid', orderPaidEvent);

    // Wait for processing
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Verify: Check output queue has invoice.issued event
    expect(emittedEvents).toHaveLength(1);
    expect(emittedEvents[0].eventType).toBe('business.invoice.issued');
    expect(emittedEvents[0].correlationId).toBe(correlationId);
    expect(emittedEvents[0].payload.order_id).toBe(orderId);
    expect(emittedEvents[0].payload.total_amount).toBe(15000);

    // Verify: Check audit logs
    const auditResult = await pool.query(
      'SELECT * FROM audit_logs WHERE correlation_id = $1 ORDER BY created_at',
      [correlationId]
    );

    expect(auditResult.rows.length).toBeGreaterThanOrEqual(2);

    const actions = auditResult.rows.map(r => r.action);
    expect(actions).toContain('order.processing_started');
    expect(actions).toContain('invoice.created');

    // Verify all audit entries have same tenant
    auditResult.rows.forEach(row => {
      expect(row.tenant_id).toBe(tenantId);
    });

    await worker.close();
    worker = null;
  });

  it('should handle processing failure with proper audit', async () => {
    const correlationId = crypto.randomUUID();
    const tenantId = 'e2e-test-tenant-002';

    let attempts = 0;

    worker = new Worker<OrderPaidEvent>(
      `${E2E_QUEUE_NAME}-input`,
      async (job: Job<OrderPaidEvent>) => {
        attempts++;

        // Log attempt
        await pool.query(
          `INSERT INTO audit_logs (tenant_id, correlation_id, action, resource_type, resource_id, result, details)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            job.data.tenantId,
            job.data.correlationId,
            'order.processing_attempt',
            'order',
            job.data.payload.order_id,
            attempts < 2 ? 'failure' : 'success',
            JSON.stringify({ attempt: attempts }),
          ]
        );

        if (attempts < 2) {
          throw new Error('Simulated failure');
        }

        return { success: true };
      },
      {
        connection: redis,
        settings: {
          backoffStrategy: () => 100,
        },
      }
    );

    const event: OrderPaidEvent = {
      eventId: crypto.randomUUID(),
      eventType: 'business.order.paid',
      tenantId,
      correlationId,
      occurredAt: new Date().toISOString(),
      source: 'test',
      payload: {
        order_id: 'ORD-FAIL-001',
        payment_id: 'PAY-FAIL-001',
        amount: 5000,
        currency: 'ARS',
        customer: { id: 'C-001', email: 'test@test.com', name: 'Test' },
        items: [],
      },
    };

    await inputQueue.add('order.paid', event, {
      attempts: 3,
      backoff: { type: 'fixed', delay: 100 },
    });

    // Wait for retries
    await new Promise(resolve => setTimeout(resolve, 1500));

    expect(attempts).toBe(2);

    // Check audit logs show both failure and success
    const auditResult = await pool.query(
      'SELECT * FROM audit_logs WHERE correlation_id = $1 ORDER BY created_at',
      [correlationId]
    );

    const results = auditResult.rows.map(r => r.result);
    expect(results).toContain('failure');
    expect(results).toContain('success');

    await worker.close();
    worker = null;
  });

  it('should maintain correlation_id across the entire flow', async () => {
    const correlationId = crypto.randomUUID();
    const tenantId = 'e2e-test-tenant-003';

    const allCorrelationIds: string[] = [];

    worker = new Worker<OrderPaidEvent>(
      `${E2E_QUEUE_NAME}-input`,
      async (job: Job<OrderPaidEvent>) => {
        allCorrelationIds.push(job.data.correlationId);

        // Simulate multiple sub-operations, all with same correlation
        const operations = ['validate', 'transform', 'store', 'notify'];

        for (const op of operations) {
          await pool.query(
            `INSERT INTO audit_logs (tenant_id, correlation_id, action, resource_type, resource_id, result)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [
              job.data.tenantId,
              job.data.correlationId, // Same correlation throughout
              `order.${op}`,
              'order',
              job.data.payload.order_id,
              'success',
            ]
          );
        }

        return { success: true };
      },
      { connection: redis }
    );

    const event: OrderPaidEvent = {
      eventId: crypto.randomUUID(),
      eventType: 'business.order.paid',
      tenantId,
      correlationId,
      occurredAt: new Date().toISOString(),
      source: 'test',
      payload: {
        order_id: 'ORD-CORR-001',
        payment_id: 'PAY-001',
        amount: 1000,
        currency: 'ARS',
        customer: { id: 'C-001', email: 'test@test.com', name: 'Test' },
        items: [],
      },
    };

    await inputQueue.add('order.paid', event);

    await new Promise(resolve => setTimeout(resolve, 500));

    // Verify all audit entries have same correlation_id
    const auditResult = await pool.query(
      'SELECT DISTINCT correlation_id FROM audit_logs WHERE tenant_id = $1',
      [tenantId]
    );

    expect(auditResult.rows).toHaveLength(1);
    expect(auditResult.rows[0].correlation_id).toBe(correlationId);

    // Verify we can trace entire flow with one correlation_id
    const fullTrace = await pool.query(
      'SELECT action FROM audit_logs WHERE correlation_id = $1 ORDER BY created_at',
      [correlationId]
    );

    expect(fullTrace.rows.length).toBe(4);
    expect(fullTrace.rows.map(r => r.action)).toEqual([
      'order.validate',
      'order.transform',
      'order.store',
      'order.notify',
    ]);

    await worker.close();
    worker = null;
  });
});
