/**
 * Event bus singleton — backend auto-seleccionado por entorno:
 *   REDIS_URL set   → RedisStreamsEventBus (durable, funciona con multiples replicas)
 *   REDIS_URL unset → InMemoryEventBus     (dev/test, sin dependencias extra)
 *
 * Importante: este módulo es usado por varios otros módulos "container/*" que
 * se importan durante el bootstrap. Para evitar footguns de orden de imports,
 * `eventBus` soporta `subscribe()`/`subscribeAll()` antes de que el bus real esté
 * listo: las suscripciones se encolan y se registran cuando `eventBusReady` resuelve.
 */

import { InMemoryEventBus, RedisStreamsEventBus } from '@integrax/event-bus';
import type { EventBus, Unsubscribe } from '@integrax/event-bus';

async function createEventBus(): Promise<EventBus> {
  const requireRedis =
    process.env.NODE_ENV === 'production' ||
    process.env.REQUIRE_REDIS_EVENT_BUS === 'true';

  if (!process.env.REDIS_URL) {
    if (requireRedis) {
      throw new Error(
        '[FATAL] REDIS_URL is required for the event bus (set REDIS_URL or disable REQUIRE_REDIS_EVENT_BUS).',
      );
    }
    return new InMemoryEventBus();
  }

  {
    const bus = new RedisStreamsEventBus(process.env.REDIS_URL);
    await bus.start();
    return bus;
  }
}

// Se inicializa antes de que el servidor acepte requests (ver server.ts).
export const eventBusReady: Promise<EventBus> = createEventBus();

let _bus: EventBus | null = null;
eventBusReady.then(b => { _bus = b; }).catch(() => {});

type PendingSubscription =
  | {
      kind: 'subscribe';
      type: Parameters<EventBus['subscribe']>[0];
      handler: Parameters<EventBus['subscribe']>[1];
      options?: Parameters<EventBus['subscribe']>[2];
      cancelled: boolean;
      unsubscribe?: Unsubscribe;
    }
  | {
      kind: 'subscribeAll';
      handler: Parameters<EventBus['subscribeAll']>[0];
      options?: Parameters<EventBus['subscribeAll']>[1];
      cancelled: boolean;
      unsubscribe?: Unsubscribe;
    };

const pending: PendingSubscription[] = [];
let flushing = false;

async function flushPending(): Promise<void> {
  if (flushing) return;
  if (!_bus) return;
  flushing = true;
  try {
    for (const sub of pending) {
      if (sub.unsubscribe) continue;

      if (sub.kind === 'subscribe') {
        sub.unsubscribe = sub.cancelled ? (() => {}) : _bus.subscribe(sub.type, sub.handler, sub.options);
      } else {
        sub.unsubscribe = sub.cancelled ? (() => {}) : _bus.subscribeAll(sub.handler, sub.options);
      }

      if (sub.cancelled) {
        try { sub.unsubscribe(); } catch { /* ignore */ }
      }
    }
  } finally {
    flushing = false;
  }
}

eventBusReady.then(() => flushPending()).catch(() => {});

export const eventBus: EventBus = {
  async publish(event) {
    const bus = _bus ?? (await eventBusReady);
    return bus.publish(event);
  },

  subscribe(type, handler, options) {
    if (_bus) return _bus.subscribe(type, handler, options);

    const sub: PendingSubscription = { kind: 'subscribe', type, handler, options, cancelled: false };
    pending.push(sub);
    void eventBusReady.then(() => flushPending());

    return () => {
      sub.cancelled = true;
      if (sub.unsubscribe) {
        try { sub.unsubscribe(); } catch { /* ignore */ }
      }
    };
  },

  subscribeAll(handler, options) {
    if (_bus) return _bus.subscribeAll(handler, options);

    const sub: PendingSubscription = { kind: 'subscribeAll', handler, options, cancelled: false };
    pending.push(sub);
    void eventBusReady.then(() => flushPending());

    return () => {
      sub.cancelled = true;
      if (sub.unsubscribe) {
        try { sub.unsubscribe(); } catch { /* ignore */ }
      }
    };
  },

  deadLetterQueue() {
    if (_bus) return _bus.deadLetterQueue();
    return [];
  },

  async replayDlq(type) {
    const bus = _bus ?? (await eventBusReady);
    return bus.replayDlq(type);
  },
};
