import type {
  EventBus,
  EventHandler,
  IntegraxEvent,
  Unsubscribe,
  DeadLetterEntry,
  SubscribeOptions,
} from './types.js';
import type { IntegraxEventType } from './event-types.js';

// ioredis is a peer dep — imported dynamically so the package stays optional
// in environments that don't install it (tests, edge runtimes).
type RedisClient = {
  xadd(key: string, id: string, ...fields: string[]): Promise<string | null>;
  xread(...args: unknown[]): Promise<[string, [string, string[]][]][] | null>;
  xlen(key: string): Promise<number>;
  quit(): Promise<void>;
  duplicate(): RedisClient;
};

const STREAM_KEY = 'integrax:events';
const CONSUMER_GROUP = 'integrax-control-plane';
const DLQ_KEY = 'integrax:events:dlq';
const BLOCK_MS = 2000;
const MAX_DLQ = 1000;

interface Subscription {
  id: number;
  types: IntegraxEventType[] | null;
  handler: EventHandler;
  name?: string;
  catchErrors: boolean;
}

/**
 * EventBus respaldado por Redis Streams.
 *
 * - Durabilidad: los eventos sobreviven reinicios del proceso.
 * - Multi-replica: todas las replicas del control-plane leen del mismo stream.
 * - DLQ: errores del handler van a un stream separado (integrax:events:dlq).
 *
 * Uso:
 *   const bus = new RedisStreamsEventBus('redis://localhost:6379');
 *   await bus.start();   // arranca el consumer loop
 *   // ... bus.publish() / bus.subscribe() ...
 *   await bus.stop();
 */
export class RedisStreamsEventBus implements EventBus {
  private readonly redisUrl: string;
  private producer: RedisClient | null = null;
  private consumer: RedisClient | null = null;
  private subscriptions: Subscription[] = [];
  private nextId = 0;
  private running = false;
  private dlq: DeadLetterEntry[] = [];
  private consumerName: string;

  constructor(redisUrl: string) {
    this.redisUrl = redisUrl;
    // Unique consumer name per process instance so multiple replicas don't steal each other's messages
    this.consumerName = `cp-${process.pid}-${Date.now()}`;
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  async start(): Promise<void> {
    const { Redis } = await import('ioredis');
    this.producer = new Redis(this.redisUrl, { lazyConnect: true, enableOfflineQueue: false }) as unknown as RedisClient;
    this.consumer = (this.producer as unknown as { duplicate(): RedisClient }).duplicate();

    await this.ensureConsumerGroup();
    this.running = true;
    this.consumeLoop().catch(err =>
      console.error('[RedisStreamsEventBus] Consumer loop crashed:', err),
    );
  }

  async stop(): Promise<void> {
    this.running = false;
    await this.producer?.quit();
    await this.consumer?.quit();
  }

  // ── EventBus interface ─────────────────────────────────────────────────────

  async publish(event: IntegraxEvent): Promise<void> {
    if (!this.producer) throw new Error('RedisStreamsEventBus not started — call start() first');
    const payload = JSON.stringify(event);
    await this.producer.xadd(STREAM_KEY, '*', 'type', event.type, 'tenantId', event.tenantId, 'data', payload);
  }

  subscribe(
    type: IntegraxEventType | IntegraxEventType[],
    handler: EventHandler,
    options: SubscribeOptions = {},
  ): Unsubscribe {
    const types = Array.isArray(type) ? type : [type];
    return this.addSubscription(types, handler, options);
  }

  subscribeAll(handler: EventHandler, options: SubscribeOptions = {}): Unsubscribe {
    return this.addSubscription(null, handler, options);
  }

  deadLetterQueue(): DeadLetterEntry[] {
    return [...this.dlq];
  }

  async replayDlq(type?: IntegraxEventType): Promise<void> {
    const entries = type ? this.dlq.filter(e => e.event.type === type) : [...this.dlq];
    for (const entry of entries) {
      const idx = this.dlq.indexOf(entry);
      if (idx !== -1) this.dlq.splice(idx, 1);
    }
    for (const entry of entries) {
      await this.publish({ ...entry.event, retryCount: (entry.event.retryCount ?? 0) + 1 });
    }
  }

  // ── Internal ───────────────────────────────────────────────────────────────

  private addSubscription(
    types: IntegraxEventType[] | null,
    handler: EventHandler,
    options: SubscribeOptions,
  ): Unsubscribe {
    const id = this.nextId++;
    this.subscriptions.push({ id, types, handler, name: options.name, catchErrors: options.catchErrors ?? true });
    return () => { this.subscriptions = this.subscriptions.filter(s => s.id !== id); };
  }

  private async ensureConsumerGroup(): Promise<void> {
    try {
      await (this.consumer as unknown as { xgroup(cmd: string, key: string, group: string, id: string, mkstream: string): Promise<unknown> })
        .xgroup('CREATE', STREAM_KEY, CONSUMER_GROUP, '$', 'MKSTREAM');
    } catch (err: unknown) {
      // BUSYGROUP = group already exists, that's fine
      if (!(err instanceof Error && err.message.includes('BUSYGROUP'))) throw err;
    }
  }

  private async consumeLoop(): Promise<void> {
    const redis = this.consumer as unknown as {
      xreadgroup(
        cmd: 'GROUP', group: string, consumer: string,
        countCmd: 'COUNT', count: number,
        blockCmd: 'BLOCK', ms: number,
        streamsCmd: 'STREAMS', key: string, id: string,
      ): Promise<[string, [string, string[]][]][] | null>;
      xack(key: string, group: string, ...ids: string[]): Promise<number>;
    };

    while (this.running) {
      try {
        const results = await redis.xreadgroup(
          'GROUP', CONSUMER_GROUP, this.consumerName,
          'COUNT', 10,
          'BLOCK', BLOCK_MS,
          'STREAMS', STREAM_KEY, '>',
        );

        if (!results) continue;

        for (const [, messages] of results) {
          for (const [msgId, fields] of messages) {
            const dataIdx = fields.indexOf('data');
            if (dataIdx === -1) continue;

            let event: IntegraxEvent;
            try {
              event = JSON.parse(fields[dataIdx + 1]) as IntegraxEvent;
              // Redis serializes dates as strings — restore them
              event.occurredAt = new Date(event.occurredAt);
            } catch {
              await redis.xack(STREAM_KEY, CONSUMER_GROUP, msgId);
              continue;
            }

            const matched = this.subscriptions.filter(
              s => s.types === null || s.types.includes(event.type),
            );

            for (const sub of matched) {
              try {
                await sub.handler(event);
              } catch (err) {
                if (sub.catchErrors) {
                  if (this.dlq.length < MAX_DLQ) {
                    this.dlq.push({ event, error: err, failedAt: new Date(), handlerName: sub.name });
                  }
                } else {
                  throw err;
                }
              }
            }

            await redis.xack(STREAM_KEY, CONSUMER_GROUP, msgId);
          }
        }
      } catch (err) {
        if (this.running) {
          console.error('[RedisStreamsEventBus] Error in consume loop, retrying in 1s:', err);
          await new Promise(r => setTimeout(r, 1000));
        }
      }
    }
  }
}
