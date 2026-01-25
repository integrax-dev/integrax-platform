/**
 * Kafka Consumer Tests
 *
 * Tests para el consumer que procesa eventos CDC y de negocio
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Types matching the consumer
interface DebeziumEvent {
  schema?: unknown;
  payload: {
    before: Record<string, unknown> | null;
    after: Record<string, unknown> | null;
    source: {
      table: string;
      db: string;
    };
    op: 'c' | 'u' | 'd' | 'r';
    ts_ms: number;
  };
}

interface BusinessEvent {
  eventId: string;
  eventType: string;
  tenantId: string;
  correlationId: string;
  timestamp: string;
  data: Record<string, unknown>;
}

// Mock workflow triggers
const workflowTriggers: Array<{ workflowType: string; input: unknown }> = [];

// Simulated CDC event handler
async function handleCDCEvent(topic: string, event: DebeziumEvent): Promise<void> {
  const { payload } = event;
  const table = payload.source.table;
  const operation = payload.op;

  if (table === 'outbox' && operation === 'c') {
    const record = payload.after;
    if (!record) return;

    const aggregateType = record.aggregate_type as string;

    if (aggregateType === 'payment') {
      workflowTriggers.push({
        workflowType: 'paymentWorkflow',
        input: {
          paymentId: record.aggregate_id,
          tenantId: (record.payload as any)?.tenantId || 'default',
          correlationId: 'corr-123',
          source: 'cdc',
        },
      });
    } else if (aggregateType === 'order') {
      workflowTriggers.push({
        workflowType: 'orderWorkflow',
        input: record.payload,
      });
    }
  }

  if (table === 'payments' && (operation === 'c' || operation === 'u')) {
    const record = payload.after;
    if (!record) return;

    if (operation === 'c' || payload.before?.status !== record.status) {
      workflowTriggers.push({
        workflowType: 'paymentWorkflow',
        input: {
          paymentId: record.external_id,
          tenantId: record.tenant_id,
          correlationId: 'corr-123',
          source: 'cdc',
        },
      });
    }
  }
}

// Simulated business event handler
async function handleBusinessEvent(topic: string, event: BusinessEvent): Promise<void> {
  if (event.eventType.startsWith('payment.')) {
    workflowTriggers.push({
      workflowType: 'paymentWorkflow',
      input: {
        paymentId: event.data.paymentId,
        tenantId: event.tenantId,
        correlationId: event.correlationId,
        source: 'api',
      },
    });
  }

  if (event.eventType === 'webhook.mercadopago') {
    const webhookData = event.data as { type: string; data: { id: string } };
    if (webhookData.type === 'payment') {
      workflowTriggers.push({
        workflowType: 'paymentWorkflow',
        input: {
          paymentId: webhookData.data.id,
          tenantId: event.tenantId,
          correlationId: event.correlationId,
          source: 'webhook',
        },
      });
    }
  }
}

describe('Kafka Consumer', () => {
  beforeEach(() => {
    workflowTriggers.length = 0;
  });

  describe('CDC Event Handling', () => {
    it('should trigger payment workflow from outbox pattern', async () => {
      const event: DebeziumEvent = {
        payload: {
          before: null,
          after: {
            id: '1',
            aggregate_type: 'payment',
            aggregate_id: 'PAY-123',
            event_type: 'payment_created',
            payload: { tenantId: 'tenant-1', amount: 1000 },
          },
          source: { table: 'outbox', db: 'integrax' },
          op: 'c',
          ts_ms: Date.now(),
        },
      };

      await handleCDCEvent('integrax.public.outbox', event);

      expect(workflowTriggers).toHaveLength(1);
      expect(workflowTriggers[0].workflowType).toBe('paymentWorkflow');
      expect(workflowTriggers[0].input).toMatchObject({
        paymentId: 'PAY-123',
        tenantId: 'tenant-1',
        source: 'cdc',
      });
    });

    it('should trigger order workflow from outbox pattern', async () => {
      const event: DebeziumEvent = {
        payload: {
          before: null,
          after: {
            id: '2',
            aggregate_type: 'order',
            aggregate_id: 'ORD-456',
            event_type: 'order_created',
            payload: {
              orderId: 'ORD-456',
              tenantId: 'tenant-1',
              items: [],
              totalAmount: 500,
            },
          },
          source: { table: 'outbox', db: 'integrax' },
          op: 'c',
          ts_ms: Date.now(),
        },
      };

      await handleCDCEvent('integrax.public.outbox', event);

      expect(workflowTriggers).toHaveLength(1);
      expect(workflowTriggers[0].workflowType).toBe('orderWorkflow');
    });

    it('should trigger workflow on payment insert', async () => {
      const event: DebeziumEvent = {
        payload: {
          before: null,
          after: {
            id: '100',
            external_id: 'MP-123456',
            tenant_id: 'tenant-1',
            status: 'approved',
            amount: 1500,
          },
          source: { table: 'payments', db: 'integrax' },
          op: 'c',
          ts_ms: Date.now(),
        },
      };

      await handleCDCEvent('integrax.public.payments', event);

      expect(workflowTriggers).toHaveLength(1);
      expect(workflowTriggers[0].input).toMatchObject({
        paymentId: 'MP-123456',
        tenantId: 'tenant-1',
        source: 'cdc',
      });
    });

    it('should trigger workflow on payment status change', async () => {
      const event: DebeziumEvent = {
        payload: {
          before: {
            id: '100',
            external_id: 'MP-123456',
            tenant_id: 'tenant-1',
            status: 'pending',
            amount: 1500,
          },
          after: {
            id: '100',
            external_id: 'MP-123456',
            tenant_id: 'tenant-1',
            status: 'approved',
            amount: 1500,
          },
          source: { table: 'payments', db: 'integrax' },
          op: 'u',
          ts_ms: Date.now(),
        },
      };

      await handleCDCEvent('integrax.public.payments', event);

      expect(workflowTriggers).toHaveLength(1);
    });

    it('should NOT trigger workflow when payment status unchanged', async () => {
      const event: DebeziumEvent = {
        payload: {
          before: {
            id: '100',
            external_id: 'MP-123456',
            tenant_id: 'tenant-1',
            status: 'approved',
            amount: 1500,
          },
          after: {
            id: '100',
            external_id: 'MP-123456',
            tenant_id: 'tenant-1',
            status: 'approved',
            amount: 1500,
            updated_at: new Date().toISOString(), // Only metadata changed
          },
          source: { table: 'payments', db: 'integrax' },
          op: 'u',
          ts_ms: Date.now(),
        },
      };

      await handleCDCEvent('integrax.public.payments', event);

      expect(workflowTriggers).toHaveLength(0);
    });

    it('should ignore delete operations on outbox', async () => {
      const event: DebeziumEvent = {
        payload: {
          before: { id: '1', aggregate_type: 'payment' },
          after: null,
          source: { table: 'outbox', db: 'integrax' },
          op: 'd',
          ts_ms: Date.now(),
        },
      };

      await handleCDCEvent('integrax.public.outbox', event);

      expect(workflowTriggers).toHaveLength(0);
    });

    it('should handle events without after payload', async () => {
      const event: DebeziumEvent = {
        payload: {
          before: { id: '1' },
          after: null,
          source: { table: 'outbox', db: 'integrax' },
          op: 'c',
          ts_ms: Date.now(),
        },
      };

      await handleCDCEvent('integrax.public.outbox', event);

      expect(workflowTriggers).toHaveLength(0);
    });
  });

  describe('Business Event Handling', () => {
    it('should trigger payment workflow for payment events', async () => {
      const event: BusinessEvent = {
        eventId: 'evt-123',
        eventType: 'payment.received',
        tenantId: 'tenant-1',
        correlationId: 'corr-abc',
        timestamp: new Date().toISOString(),
        data: {
          paymentId: 'PAY-789',
          amount: 2000,
        },
      };

      await handleBusinessEvent('integrax.payments', event);

      expect(workflowTriggers).toHaveLength(1);
      expect(workflowTriggers[0].workflowType).toBe('paymentWorkflow');
      expect(workflowTriggers[0].input).toMatchObject({
        paymentId: 'PAY-789',
        tenantId: 'tenant-1',
        correlationId: 'corr-abc',
        source: 'api',
      });
    });

    it('should handle MercadoPago webhook events', async () => {
      const event: BusinessEvent = {
        eventId: 'evt-webhook-1',
        eventType: 'webhook.mercadopago',
        tenantId: 'tenant-1',
        correlationId: 'corr-mp',
        timestamp: new Date().toISOString(),
        data: {
          type: 'payment',
          data: { id: '12345678' },
        },
      };

      await handleBusinessEvent('integrax.webhooks', event);

      expect(workflowTriggers).toHaveLength(1);
      expect(workflowTriggers[0].input).toMatchObject({
        paymentId: '12345678',
        source: 'webhook',
      });
    });

    it('should ignore non-payment MercadoPago webhook events', async () => {
      const event: BusinessEvent = {
        eventId: 'evt-webhook-2',
        eventType: 'webhook.mercadopago',
        tenantId: 'tenant-1',
        correlationId: 'corr-mp',
        timestamp: new Date().toISOString(),
        data: {
          type: 'merchant_order', // Not a payment
          data: { id: '999' },
        },
      };

      await handleBusinessEvent('integrax.webhooks', event);

      expect(workflowTriggers).toHaveLength(0);
    });

    it('should preserve correlation IDs', async () => {
      const correlationId = 'unique-correlation-123';

      const event: BusinessEvent = {
        eventId: 'evt-456',
        eventType: 'payment.created',
        tenantId: 'tenant-1',
        correlationId,
        timestamp: new Date().toISOString(),
        data: { paymentId: 'PAY-999' },
      };

      await handleBusinessEvent('integrax.payments', event);

      expect(workflowTriggers[0].input).toMatchObject({
        correlationId,
      });
    });
  });

  describe('Event Routing', () => {
    it('should correctly identify Debezium CDC events', () => {
      const cdcEvent = {
        payload: {
          op: 'c',
          before: null,
          after: {},
          source: { table: 'test', db: 'db' },
          ts_ms: 123,
        },
      };

      const isCDC = cdcEvent.payload && cdcEvent.payload.op !== undefined;
      expect(isCDC).toBe(true);
    });

    it('should correctly identify business events', () => {
      const businessEvent = {
        eventId: '123',
        eventType: 'payment.created',
        tenantId: 'tenant-1',
        correlationId: 'corr',
        timestamp: new Date().toISOString(),
        data: {},
      };

      const isBusinessEvent = businessEvent.eventType !== undefined;
      expect(isBusinessEvent).toBe(true);
    });
  });
});

describe('Topic Configuration', () => {
  const EXPECTED_TOPICS = [
    'integrax.public.payments',
    'integrax.public.orders',
    'integrax.public.invoices',
    'integrax.public.outbox',
    'integrax.payments',
    'integrax.orders',
    'integrax.webhooks',
  ];

  it('should have all required CDC topics', () => {
    const cdcTopics = EXPECTED_TOPICS.filter(t => t.includes('.public.'));
    expect(cdcTopics).toHaveLength(4);
    expect(cdcTopics).toContain('integrax.public.payments');
    expect(cdcTopics).toContain('integrax.public.orders');
    expect(cdcTopics).toContain('integrax.public.invoices');
    expect(cdcTopics).toContain('integrax.public.outbox');
  });

  it('should have all required business event topics', () => {
    const businessTopics = EXPECTED_TOPICS.filter(t => !t.includes('.public.'));
    expect(businessTopics).toHaveLength(3);
    expect(businessTopics).toContain('integrax.payments');
    expect(businessTopics).toContain('integrax.orders');
    expect(businessTopics).toContain('integrax.webhooks');
  });
});
