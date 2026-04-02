/**
 * Kafka Consumer Service
 *
 * Consumes events from:
 * - Debezium CDC topics (database changes)
 * - Business event topics
 *
 * Triggers Temporal workflows based on events.
 */

import { Kafka, Consumer, EachMessagePayload, logLevel } from 'kafkajs';
import { TemporalClientService } from '@integrax/temporal-workflows';
import { config } from 'dotenv';
import { createLogger } from '@integrax/logger';
import express from 'express';
import crypto from 'node:crypto';

config();

const logger = createLogger({ service: 'kafka-consumer', version: '0.1.0' });

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? String(fallback), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseKafkaBrokers(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(',')
    .map((broker) => broker.trim())
    .filter((broker) => broker.length > 0);
}

const KAFKA_BROKERS = parseKafkaBrokers(process.env.KAFKA_BROKERS);
if (KAFKA_BROKERS.length === 0) throw new Error('KAFKA_BROKERS env var is required');

const KAFKA_GROUP_ID = process.env.KAFKA_GROUP_ID || 'integrax-consumer';
const TEMPORAL_ADDRESS = process.env.TEMPORAL_ADDRESS as string;
if (!TEMPORAL_ADDRESS) throw new Error('TEMPORAL_ADDRESS env var is required');

const TEMPORAL_TASK_QUEUE = process.env.TEMPORAL_TASK_QUEUE || 'integrax-workflows';

// Topics to subscribe
const TOPICS = [
  // Debezium CDC topics
  'integrax.public.payments',
  'integrax.public.orders',
  'integrax.public.invoices',
  'integrax.public.outbox',
  // Business events
  'integrax.payments',
  'integrax.orders',
  'integrax.webhooks',
  'integrax.schemas.discovery',
];

// Temporal client (lazy initialized)
let temporalClient: TemporalClientService | null = null;

async function getTemporalClient(): Promise<TemporalClientService> {
  if (!temporalClient) {
    temporalClient = new TemporalClientService();
    await temporalClient.connect();
  }
  return temporalClient;
}

// Debezium CDC event schema
interface DebeziumEvent {
  schema?: unknown;
  payload: {
    before: Record<string, unknown> | null;
    after: Record<string, unknown> | null;
    source: {
      table: string;
      db: string;
    };
    op: 'c' | 'u' | 'd' | 'r'; // create, update, delete, read
    ts_ms: number;
  };
}

// Business event schema
interface BusinessEvent {
  eventId: string;
  eventType: string;
  tenantId: string;
  correlationId: string;
  timestamp: string;
  data: Record<string, unknown>;
}

interface SchemaDiscoveryEvent {
  tenantId: string;
  sourceSchemaId: string;
  targetSchemaId: string;
  samplesA: Record<string, unknown>[];
  samplesB: Record<string, unknown>[];
  options?: {
    forceRecalculate?: boolean;
  };
}

// Handle CDC events from Debezium
async function handleCDCEvent(topic: string, event: DebeziumEvent): Promise<void> {
  const { payload } = event;
  const table = payload.source.table;
  const operation = payload.op;

  logger.info({ table, operation: operation }, 'CDC event');

  const client = await getTemporalClient();

  // Handle outbox pattern - trigger workflows from outbox table
  if (table === 'outbox' && operation === 'c') {
    const record = payload.after;
    if (!record) return;

    const aggregateType = record.aggregate_type as string;
    const eventType = record.event_type as string;
    const eventPayload = record.payload as Record<string, unknown>;

    logger.info({ aggregateType, eventType }, 'Outbox event');

    // Route to appropriate workflow based on aggregate type
    switch (aggregateType) {
      case 'payment':
        await client.startPayment(eventPayload.tenantId || 'default', {
          paymentId: record.aggregate_id as string,
          tenantId: eventPayload.tenantId || 'default',
          correlationId: crypto.randomUUID(),
          source: 'cdc',
        });
        break;

      case 'order':
        // En una implementación real usaríamos startOrder del cliente
        break;
    }
  }

  // Handle direct table changes
  if (table === 'payments' && (operation === 'c' || operation === 'u')) {
    const record = payload.after;
    if (!record) return;

    // Only trigger workflow for new payments or status changes
    if (operation === 'c' || payload.before?.status !== record.status) {
      logger.info({ paymentId: record.external_id, status: record.status }, 'Payment CDC');

      await client.startPayment(record.tenant_id as string, {
        paymentId: record.external_id as string,
        tenantId: record.tenant_id as string,
        correlationId: crypto.randomUUID(),
        source: 'cdc',
      });
    }
  }
}

// Handle schema discovery
async function handleSchemaDiscovery(event: SchemaDiscoveryEvent): Promise<void> {
  logger.info({ tenantId: event.tenantId, source: event.sourceSchemaId }, 'Schema Discovery Event');
  const client = await getTemporalClient();

  const workflowId = `auto-discovery-${event.tenantId}-${event.sourceSchemaId}-${Date.now()}`;
  
  await client.startSchemaDiff(event.tenantId, {
    tenantId: event.tenantId,
    sourceSchemaId: event.sourceSchemaId,
    targetSchemaId: event.targetSchemaId,
    samplesA: event.samplesA,
    samplesB: event.samplesB,
    options: {
      forceRecalculate: event.options?.forceRecalculate || false,
    }
  }, workflowId);

  logger.info({ workflowId }, 'Auto-discovery workflow triggered');
}

// Handle business events
async function handleBusinessEvent(topic: string, event: BusinessEvent): Promise<void> {
  logger.info({ eventType: event.eventType, correlationId: event.correlationId }, 'Business event');

  const client = await getTemporalClient();

  // Route based on event type
  if (event.eventType.startsWith('payment.')) {
    await client.workflow.start('paymentWorkflow', {
      taskQueue: TEMPORAL_TASK_QUEUE,
      workflowId: `payment-${event.data.paymentId}-${Date.now()}`,
      args: [
        {
          paymentId: event.data.paymentId,
          tenantId: event.tenantId,
          correlationId: event.correlationId,
          source: 'api',
        },
      ],
    });
  }

  if (event.eventType.startsWith('order.')) {
    // Signal existing order workflow
    try {
      const handle = client.workflow.getHandle(`order-${event.data.orderId}`);

      if (event.eventType === 'order.payment_received') {
        await handle.signal('paymentReceived', {
          paymentId: event.data.paymentId,
          amount: event.data.amount,
        });
      } else if (event.eventType === 'order.cancelled') {
        await handle.signal('cancelOrder', event.data.reason || 'Cancelled by user');
      }
    } catch (error) {
      logger.warn({ orderId: event.data.orderId }, 'Order workflow not found, skipping signal');
      // Workflow doesn't exist, might need to create one
    }
  }

  if (event.eventType === 'webhook.mercadopago') {
    // MercadoPago webhook
    const webhookData = event.data as { type: string; data: { id: string } };

    if (webhookData.type === 'payment') {
      await client.workflow.start('paymentWorkflow', {
        taskQueue: TEMPORAL_TASK_QUEUE,
        workflowId: `payment-webhook-${webhookData.data.id}-${Date.now()}`,
        args: [
          {
            paymentId: webhookData.data.id,
            tenantId: event.tenantId,
            correlationId: event.correlationId,
            source: 'webhook',
          },
        ],
      });
    }
  }
}

// Message handler
async function handleMessage({ topic, partition, message }: EachMessagePayload): Promise<void> {
  if (!message.value) return;

  try {
    const value = JSON.parse(message.value.toString());

    if (topic === 'integrax.schemas.discovery') {
      await handleSchemaDiscovery(value as SchemaDiscoveryEvent);
    } else if (value.payload && value.payload.op) {
      await handleCDCEvent(topic, value as DebeziumEvent);
    } else if (value.eventType) {
      await handleBusinessEvent(topic, value as BusinessEvent);
    } else {
      logger.warn({ topic }, 'Unknown message format');
    }
  } catch (error) {
    logger.error({ err: error, topic }, 'Failed to process message');
  }
}

// Main
async function main() {
  logger.info({ brokers: KAFKA_BROKERS, groupId: KAFKA_GROUP_ID, temporal: TEMPORAL_ADDRESS }, 'Starting kafka-consumer');

  // Create Kafka consumer
  const kafka = new Kafka({
    clientId: 'integrax-consumer',
    brokers: KAFKA_BROKERS,
    logLevel: logLevel.WARN,
  });

  const consumer = kafka.consumer({ groupId: KAFKA_GROUP_ID });

  // Connect to Temporal (validate connection)
  logger.info('Connecting to Temporal...');
  await getTemporalClient();
  logger.info('Temporal connected');

  // Connect to Kafka
  logger.info('Connecting to Kafka...');
  await consumer.connect();
  logger.info('Kafka connected');

  // Subscribe to topics
  logger.info({ topics: TOPICS }, 'Subscribing to topics');
  await consumer.subscribe({
    topics: TOPICS,
    fromBeginning: false,
  });

  // Health HTTP sidecar
  const healthPort = parsePositiveInt(process.env.HEALTH_PORT, 3001);
  const healthApp = express();
  healthApp.get('/health', (_req, res) => res.json({ status: 'healthy', service: 'kafka-consumer' }));
  healthApp.get('/ready', (_req, res) => res.json({ status: 'healthy', service: 'kafka-consumer' }));
  const healthServer = healthApp.listen(healthPort, () => { logger.info({ healthPort }, 'Health sidecar running'); });

  // Handle shutdown
  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;

    logger.info('Shutting down...');
    try {
      await consumer.stop();
    } catch (err) {
      logger.warn({ err }, 'Failed to stop consumer loop cleanly');
    }

    try {
      await consumer.disconnect();
    } catch (err) {
      logger.warn({ err }, 'Failed to disconnect Kafka consumer cleanly');
    }

    if (temporalClient) {
      await temporalClient.connection.close();
    }

    await new Promise<void>((resolve) => {
      healthServer.close(() => resolve());
    });

    logger.info('Consumer stopped');
    process.exit(0);
  };

  process.on('SIGINT', () => {
    void shutdown();
  });
  process.on('SIGTERM', () => {
    void shutdown();
  });

  // Run consumer
  logger.info('Consumer running');

  await consumer.run({
    eachMessage: handleMessage,
  });
}

main().catch((err) => {
  logger.fatal({ err }, 'Consumer fatal error');
  process.exit(1);
});
