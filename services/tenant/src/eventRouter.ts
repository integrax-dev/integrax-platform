/**
 * Event Router multi-tenant
 *
 * Routes events through Kafka with tenant isolation.
 * Falls back to in-memory for development.
 */
import { Kafka, Producer, Consumer, EachMessagePayload } from 'kafkajs';
import { Event } from './types.js';
import { moveToDLQ } from './dlqManager.js';

// Kafka clients
let kafka: Kafka | null = null;
let producer: Producer | null = null;
let consumer: Consumer | null = null;

// In-memory fallback for development
const memoryEvents: Map<string, Event> = new Map();
const eventHandlers: Map<string, (event: Event) => Promise<void>> = new Map();

const EVENT_TOPIC_PREFIX = 'integrax.events';

/**
 * Initialize Kafka connection
 */
export async function initializeEventRouter(): Promise<void> {
  const brokers = process.env.KAFKA_BROKERS;

  if (!brokers) {
    console.warn('[EventRouter] KAFKA_BROKERS not set. Using in-memory storage.');
    return;
  }

  kafka = new Kafka({
    clientId: process.env.KAFKA_CLIENT_ID || 'integrax-event-router',
    brokers: brokers.split(','),
    ...(process.env.KAFKA_SASL_USERNAME && {
      sasl: {
        mechanism: 'plain',
        username: process.env.KAFKA_SASL_USERNAME,
        password: process.env.KAFKA_SASL_PASSWORD || '',
      },
      ssl: true,
    }),
  });

  producer = kafka.producer();
  await producer.connect();
  console.log('[EventRouter] Kafka producer connected');
}

/**
 * Ingest a new event
 */
export async function ingestEvent(
  event: Omit<Event, 'id' | 'receivedAt' | 'status'>
): Promise<Event> {
  const id = `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const now = new Date().toISOString();

  const newEvent: Event = {
    ...event,
    id,
    receivedAt: now,
    status: 'pending',
  };

  if (producer) {
    // Publish to Kafka
    const topic = `${EVENT_TOPIC_PREFIX}.${event.tenantId}`;

    await producer.send({
      topic,
      messages: [
        {
          key: id,
          value: JSON.stringify(newEvent),
          headers: {
            tenantId: event.tenantId,
            eventType: event.type,
            schemaVersion: event.schemaVersion,
          },
        },
      ],
    });

    console.log(`[EventRouter] Event ${id} published to ${topic}`);
  } else {
    // Development fallback
    memoryEvents.set(`${event.tenantId}:${id}`, newEvent);

    // Process immediately in dev mode if handler exists
    const handler = eventHandlers.get(event.type);
    if (handler) {
      try {
        await handler(newEvent);
        newEvent.status = 'processed';
        newEvent.processedAt = new Date().toISOString();
      } catch (error) {
        newEvent.status = 'failed';
        await moveToDLQ(newEvent, error instanceof Error ? error.message : 'Unknown error');
      }
    }
  }

  return newEvent;
}

/**
 * Get events for a tenant
 */
export async function getEvents(
  tenantId: string,
  options: {
    status?: Event['status'];
    type?: string;
    limit?: number;
    offset?: number;
  } = {}
): Promise<Event[]> {
  const { status, type, limit = 100, offset = 0 } = options;

  // In Kafka mode, events are stored in the stream
  // For querying, you'd typically use a database or search index
  // For now, we only support memory mode for querying

  const events: Event[] = [];
  for (const [key, event] of memoryEvents) {
    if (!key.startsWith(`${tenantId}:`)) continue;
    if (status && event.status !== status) continue;
    if (type && event.type !== type) continue;
    events.push(event);
  }

  // Sort by receivedAt descending
  events.sort((a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime());

  return events.slice(offset, offset + limit);
}

/**
 * Get a specific event
 */
export async function getEvent(
  tenantId: string,
  eventId: string
): Promise<Event | null> {
  const key = `${tenantId}:${eventId}`;
  return memoryEvents.get(key) || null;
}

/**
 * Mark an event as processed
 */
export async function markEventProcessed(
  tenantId: string,
  eventId: string
): Promise<boolean> {
  const key = `${tenantId}:${eventId}`;
  const event = memoryEvents.get(key);

  if (!event) return false;

  event.status = 'processed';
  event.processedAt = new Date().toISOString();
  return true;
}

/**
 * Mark an event as failed
 */
export async function markEventFailed(
  tenantId: string,
  eventId: string,
  error: string
): Promise<boolean> {
  const key = `${tenantId}:${eventId}`;
  const event = memoryEvents.get(key);

  if (!event) return false;

  event.status = 'failed';
  event.processedAt = new Date().toISOString();
  await moveToDLQ(event, error);
  return true;
}

/**
 * Register an event handler
 */
export function registerEventHandler(
  eventType: string,
  handler: (event: Event) => Promise<void>
): void {
  eventHandlers.set(eventType, handler);
}

/**
 * Start consuming events for a tenant
 */
export async function startConsumer(
  tenantId: string,
  groupId: string,
  handler: (event: Event) => Promise<void>
): Promise<void> {
  if (!kafka) {
    // Register handler for in-memory mode
    console.log(`[EventRouter] Consumer registered for tenant ${tenantId} (in-memory mode)`);
    return;
  }

  consumer = kafka.consumer({ groupId });
  await consumer.connect();

  const topic = `${EVENT_TOPIC_PREFIX}.${tenantId}`;
  await consumer.subscribe({ topic, fromBeginning: false });

  await consumer.run({
    eachMessage: async ({ message }: EachMessagePayload) => {
      if (!message.value) return;

      const event = JSON.parse(message.value.toString()) as Event;

      try {
        await handler(event);
        await markEventProcessed(tenantId, event.id);
      } catch (error) {
        await markEventFailed(
          tenantId,
          event.id,
          error instanceof Error ? error.message : 'Unknown error'
        );
      }
    },
  });

  console.log(`[EventRouter] Consumer started for topic ${topic}`);
}

/**
 * Stop consuming events
 */
export async function stopConsumer(): Promise<void> {
  if (consumer) {
    await consumer.disconnect();
    consumer = null;
  }
}

/**
 * Get event statistics for a tenant
 */
export async function getEventStats(tenantId: string): Promise<{
  total: number;
  byStatus: Record<string, number>;
  byType: Record<string, number>;
}> {
  const events = await getEvents(tenantId, { limit: 10000 });

  const byStatus: Record<string, number> = {};
  const byType: Record<string, number> = {};

  for (const event of events) {
    byStatus[event.status] = (byStatus[event.status] || 0) + 1;
    byType[event.type] = (byType[event.type] || 0) + 1;
  }

  return {
    total: events.length,
    byStatus,
    byType,
  };
}

/**
 * Cleanup function for graceful shutdown
 */
export async function closeEventRouter(): Promise<void> {
  if (consumer) {
    await consumer.disconnect();
    consumer = null;
  }
  if (producer) {
    await producer.disconnect();
    producer = null;
  }
  kafka = null;
  memoryEvents.clear();
  eventHandlers.clear();
}
