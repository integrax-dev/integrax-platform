import { describe, it, expect, vi } from 'vitest';
import { InMemoryEventBus } from './in-memory-bus.js';
import type { IntegraxEvent } from './types.js';

function makeEvent(type: IntegraxEvent['type'], overrides: Partial<IntegraxEvent> = {}): IntegraxEvent {
  return {
    id: 'evt-1',
    type,
    tenantId: 'tenant-a',
    sourceSystem: 'mercadopago',
    entityType: 'order',
    entityId: 'ord-1',
    payload: { status: 'confirmed' },
    occurredAt: new Date('2025-01-01'),
    ...overrides,
  };
}

describe('InMemoryEventBus - suscripcion', () => {
  it('entrega el evento a un suscriptor compatible', async () => {
    const bus = new InMemoryEventBus();
    const received: IntegraxEvent[] = [];
    bus.subscribe('order.created', e => { received.push(e); });
    await bus.publish(makeEvent('order.created'));
    expect(received).toHaveLength(1);
    expect(received[0].type).toBe('order.created');
  });

  it('no entrega el evento a un suscriptor que no coincide', async () => {
    const bus = new InMemoryEventBus();
    const received: IntegraxEvent[] = [];
    bus.subscribe('product.updated', e => { received.push(e); });
    await bus.publish(makeEvent('order.created'));
    expect(received).toHaveLength(0);
  });

  it('entrega a suscriptores definidos con varios tipos', async () => {
    const bus = new InMemoryEventBus();
    const received: IntegraxEvent[] = [];
    bus.subscribe(['order.created', 'order.updated'], e => { received.push(e); });
    await bus.publish(makeEvent('order.created'));
    await bus.publish(makeEvent('order.updated'));
    await bus.publish(makeEvent('order.cancelled'));
    expect(received).toHaveLength(2);
  });

  it('subscribeAll recibe todos los eventos', async () => {
    const bus = new InMemoryEventBus();
    const received: IntegraxEvent[] = [];
    bus.subscribeAll(e => { received.push(e); });
    await bus.publish(makeEvent('order.created'));
    await bus.publish(makeEvent('stock.changed'));
    await bus.publish(makeEvent('conflict.detected'));
    expect(received).toHaveLength(3);
  });

  it('unsubscribe detiene la entrega', async () => {
    const bus = new InMemoryEventBus();
    const received: IntegraxEvent[] = [];
    const unsub = bus.subscribe('order.created', e => { received.push(e); });
    await bus.publish(makeEvent('order.created'));
    unsub();
    await bus.publish(makeEvent('order.created'));
    expect(received).toHaveLength(1);
  });
});

describe('InMemoryEventBus - fanout', () => {
  it('entrega a todos los suscriptores compatibles en paralelo', async () => {
    const bus = new InMemoryEventBus();
    const order: number[] = [];
    bus.subscribe('product.updated', async () => { order.push(1); });
    bus.subscribe('product.updated', async () => { order.push(2); });
    bus.subscribe('product.updated', async () => { order.push(3); });
    await bus.publish(makeEvent('product.updated'));
    expect(order).toHaveLength(3);
    expect(new Set(order)).toEqual(new Set([1, 2, 3]));
  });
});

describe('InMemoryEventBus - dead-letter queue', () => {
  it('captura errores del handler por defecto y los agrega a la DLQ', async () => {
    const bus = new InMemoryEventBus();
    bus.subscribe('invoice.failed', async () => { throw new Error('handler error'); }, { name: 'failing-handler' });
    await bus.publish(makeEvent('invoice.failed'));
    const dlq = bus.deadLetterQueue();
    expect(dlq).toHaveLength(1);
    expect((dlq[0].error as Error).message).toBe('handler error');
    expect(dlq[0].handlerName).toBe('failing-handler');
  });

  it('lanza el error cuando catchErrors es false', async () => {
    const bus = new InMemoryEventBus();
    bus.subscribe('invoice.failed', async () => { throw new Error('rethrown'); }, { catchErrors: false });
    await expect(bus.publish(makeEvent('invoice.failed'))).rejects.toThrow('rethrown');
  });

  it('replayDlq vuelve a publicar y limpia la DLQ', async () => {
    const bus = new InMemoryEventBus();
    let callCount = 0;
    bus.subscribe(
      'conflict.detected',
      async () => {
        callCount++;
        if (callCount === 1) throw new Error('first attempt fails');
        // En el segundo intento ya funciona.
      },
      { catchErrors: true },
    );
    await bus.publish(makeEvent('conflict.detected'));
    expect(bus.deadLetterQueue()).toHaveLength(1);

    await bus.replayDlq();
    expect(bus.deadLetterQueue()).toHaveLength(0);
    expect(callCount).toBe(2);
  });

  it('replayDlq puede filtrar por tipo de evento', async () => {
    const bus = new InMemoryEventBus();
    let orderCallCount = 0;
    // El handler de order.created falla la primera vez y tiene éxito en el replay.
    bus.subscribe('order.created', async () => {
      orderCallCount++;
      if (orderCallCount === 1) throw new Error('e1');
    }, { catchErrors: true });
    bus.subscribe('product.updated', async () => { throw new Error('e2'); }, { catchErrors: true });
    await bus.publish(makeEvent('order.created'));
    await bus.publish(makeEvent('product.updated'));
    expect(bus.deadLetterQueue()).toHaveLength(2);

    await bus.replayDlq('order.created');
    // order.created fue reprocesado y tuvo éxito; product.updated sigue en la DLQ.
    expect(bus.deadLetterQueue()).toHaveLength(1);
    expect(bus.deadLetterQueue()[0].event.type).toBe('product.updated');
  });

  it('los eventos reprocesados incrementan retryCount', async () => {
    const bus = new InMemoryEventBus();
    const received: IntegraxEvent[] = [];
    bus.subscribe(
      'snapshot.stale',
      async (e) => {
        if ((e.retryCount ?? 0) === 0) throw new Error('first fail');
        received.push(e);
      },
      { catchErrors: true },
    );
    await bus.publish(makeEvent('snapshot.stale'));
    await bus.replayDlq();
    expect(received[0].retryCount).toBe(1);
  });
});

describe('InMemoryEventBus - casos borde', () => {
  it('publish sin suscriptores no hace nada', async () => {
    const bus = new InMemoryEventBus();
    await expect(bus.publish(makeEvent('workflow.started'))).resolves.toBeUndefined();
  });

  it('espera a los handlers async antes de resolver', async () => {
    const bus = new InMemoryEventBus();
    const log: string[] = [];
    bus.subscribe('entity.linked', async () => {
      await new Promise(r => setTimeout(r, 5));
      log.push('done');
    });
    await bus.publish(makeEvent('entity.linked'));
    expect(log).toEqual(['done']);
  });

  it('varias suscripciones al mismo tipo reciben el evento', async () => {
    const bus = new InMemoryEventBus();
    const spyA = vi.fn();
    const spyB = vi.fn();
    bus.subscribe('stock.changed', spyA);
    bus.subscribe('stock.changed', spyB);
    await bus.publish(makeEvent('stock.changed'));
    expect(spyA).toHaveBeenCalledOnce();
    expect(spyB).toHaveBeenCalledOnce();
  });
});
