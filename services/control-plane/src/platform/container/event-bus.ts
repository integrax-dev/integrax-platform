/**
 * Event bus singleton — backend auto-seleccionado por entorno:
 *   REDIS_URL set   → RedisStreamsEventBus (durable, funciona con multiples replicas)
 *   REDIS_URL unset → InMemoryEventBus     (dev/test, sin dependencias extra)
 */

import { InMemoryEventBus, RedisStreamsEventBus } from '@integrax/event-bus';
import type { EventBus } from '@integrax/event-bus';

async function createEventBus(): Promise<EventBus> {
  if (process.env.REDIS_URL) {
    const bus = new RedisStreamsEventBus(process.env.REDIS_URL);
    await bus.start();
    return bus;
  }
  return new InMemoryEventBus();
}

// Se inicializa antes de que el servidor acepte requests (ver server.ts).
export const eventBusReady: Promise<EventBus> = createEventBus();

let _bus: EventBus | null = null;
eventBusReady.then(b => { _bus = b; }).catch(() => {});

// Proxy back-compat: todo el codigo que hace `import { eventBus }` sigue funcionando
// sin cambios. El proxy delega al bus real una vez inicializado.
export const eventBus: EventBus = new Proxy({} as EventBus, {
  get(_target, prop) {
    if (!_bus) throw new Error('Event bus no inicializado — await eventBusReady primero');
    return (_bus as unknown as Record<string, unknown>)[prop as string];
  },
});
