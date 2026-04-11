# Sistema de eventos

## Vista general

Todos los cambios de estado en IntegraX fluyen por `@integrax/event-bus`. Es la columna vertebral que conecta conectores, el consistency inspector, los triggers de workflows y el servicio de notificaciones.

## Forma del evento

```typescript
interface IntegraxEvent<T = unknown> {
  id: string;                  // ulid
  type: IntegraxEventType;     // ver registro mas abajo
  tenantId: string;
  sourceSystem: string;        // conector o servicio que lo produjo
  entityType: string;          // 'product' | 'order' | 'invoice' | ...
  entityId?: string;           // ID canonico de la entidad
  payload: T;
  occurredAt: Date;
  correlationId?: string;
  retryCount?: number;         // se setea cuando se reintenta desde la DLQ
}
```

## Registro de tipos de evento

| Categoria   | Tipos de evento                                                            |
|-------------|-----------------------------------------------------------------------------|
| Orders      | `order.created`, `order.updated`, `order.status_changed`, `order.cancelled` |
| Products    | `product.created`, `product.updated`, `product.price_changed`, `product.archived` |
| Stock       | `stock.changed`, `stock.diverged`, `stock.depleted`                         |
| Invoices    | `invoice.created`, `invoice.authorized`, `invoice.failed`, `invoice.voided` |
| Customers   | `customer.created`, `customer.updated`                                      |
| Shipments   | `shipment.created`, `shipment.status_changed`, `shipment.delivered`         |
| Consistency | `conflict.detected`, `conflict.resolved`, `conflict.escalated`              |
| Identity    | `entity.linked`, `entity.unlinked`                                          |
| Snapshots   | `snapshot.updated`, `snapshot.stale`                                        |
| System      | `webhook.received`, `workflow.started`, `workflow.completed`, `workflow.failed` |

## Fuentes de eventos

```
Webhook externo -> webhook-ingestion -> event-bus
Polling scheduler -> detecta cambio -> event-bus
Facade de conector -> llamada explicita -> event-bus (via capa de modulo)
Consistency inspector -> conflicto -> event-bus (conflict.detected)
Workflow engine -> ciclo de vida -> event-bus (workflow.started/completed)
```

## Modelo de suscripcion

```typescript
const bus = new InMemoryEventBus();

// Suscribirse a un tipo
bus.subscribe('order.created', async (event) => { ... });

// Suscribirse a varios tipos
bus.subscribe(['stock.changed', 'stock.diverged'], handler);

// Suscribirse a todo
bus.subscribeAll(handler);

// Cancelar suscripcion
const unsub = bus.subscribe('invoice.failed', handler);
unsub();
```

## Cola de mensajes fallidos

Los handlers que fallan se capturan y se mueven a la DLQ por default (`catchErrors: true`). Reproceso desde la DLQ:

```typescript
bus.deadLetterQueue()           // inspeccionar eventos fallidos
bus.replayDlq()                 // reintentar todos
bus.replayDlq('invoice.failed') // reintentar un tipo puntual
```

## Pipeline en tiempo real

```
webhook.received
  -> snapshot.updated (snapshot-store hace upsert del nuevo estado)
  -> diff detection   (platform-kernel compareEntities)
  -> conflict.detected (event-bus)
  -> workflow.started  (workflow engine toma el trigger)
  -> notification-service empuja a la UI por WebSocket/SSE
```
