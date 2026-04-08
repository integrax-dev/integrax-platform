import type {
  EventBus,
  EventHandler,
  IntegraxEvent,
  Unsubscribe,
  DeadLetterEntry,
  SubscribeOptions,
} from './types.js';
import type { IntegraxEventType } from './event-types.js';

interface Subscription {
  id: number;
  types: IntegraxEventType[] | null; // null = todos
  handler: EventHandler;
  name?: string;
  catchErrors: boolean;
}

/**
 * Bus de eventos en proceso para uso local.
 *
 * Sirve para tests y despliegues de un solo proceso. Para escenarios
 * distribuidos se reemplaza por un adaptador sobre Kafka, Redis o AMQP
 * manteniendo la misma interfaz `EventBus`.
 *
 * Comportamiento de la dead-letter queue:
 *  - Los errores del handler se capturan y van a la DLQ cuando `catchErrors: true` (por defecto).
 *  - Las entradas de la DLQ se pueden reprocesar con `replayDlq()`.
 */
export class InMemoryEventBus implements EventBus {
  private subscriptions: Subscription[] = [];
  private nextId = 0;
  private readonly dlq: DeadLetterEntry[] = [];

  // --- Publicacion ----------------------------------------------------------

  async publish(event: IntegraxEvent): Promise<void> {
    const matched = this.subscriptions.filter(
      s => s.types === null || s.types.includes(event.type),
    );
    await Promise.all(matched.map(sub => this.dispatch(sub, event)));
  }

  // --- Suscripciones --------------------------------------------------------

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

  // --- DLQ ------------------------------------------------------------------

  deadLetterQueue(): DeadLetterEntry[] {
    return [...this.dlq];
  }

  async replayDlq(type?: IntegraxEventType): Promise<void> {
    const entries = type
      ? this.dlq.filter(e => e.event.type === type)
      : [...this.dlq];

    // Sacamos primero las entradas a reprocesar para no duplicarlas si el publish falla.
    for (const entry of entries) {
      const idx = this.dlq.indexOf(entry);
      if (idx !== -1) this.dlq.splice(idx, 1);
    }

    for (const entry of entries) {
      const replayed: IntegraxEvent = {
        ...entry.event,
        retryCount: (entry.event.retryCount ?? 0) + 1,
      };
      await this.publish(replayed);
    }
  }

  // --- Interno --------------------------------------------------------------

  private addSubscription(
    types: IntegraxEventType[] | null,
    handler: EventHandler,
    options: SubscribeOptions,
  ): Unsubscribe {
    const id = this.nextId++;
    const sub: Subscription = {
      id,
      types,
      handler,
      name: options.name,
      catchErrors: options.catchErrors ?? true,
    };
    this.subscriptions.push(sub);
    return () => {
      this.subscriptions = this.subscriptions.filter(s => s.id !== id);
    };
  }

  private async dispatch(sub: Subscription, event: IntegraxEvent): Promise<void> {
    try {
      await sub.handler(event);
    } catch (err) {
      if (sub.catchErrors) {
        this.dlq.push({
          event,
          error: err,
          failedAt: new Date(),
          handlerName: sub.name,
        });
      } else {
        throw err;
      }
    }
  }
}
