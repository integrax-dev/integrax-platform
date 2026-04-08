import { ulid } from './ulid.js';
import type { EventBus, IntegraxEvent } from '@integrax/event-bus';
import type { NormalizedWebhookPayload } from './types.js';

/**
 * Encola un payload de webhook normalizado como evento de plataforma.
 *
 * La funcion devuelve enseguida despues de publicar; el bus se encarga
 * del fan-out asincrono. No conviene llamarla dentro del ciclo de respuesta
 * HTTP si la implementacion del bus es pesada; en ese caso se delega a un job
 * de fondo.
 */
export async function enqueueWebhook(
  payload: NormalizedWebhookPayload,
  tenantId: string,
  bus: EventBus,
): Promise<void> {
  const event: IntegraxEvent<NormalizedWebhookPayload> = {
    id: ulid(),
    type: payload.eventType,
    tenantId,
    sourceSystem: payload.connectorId,
    entityType: payload.entityType,
    entityId: payload.entityId,
    payload,
    occurredAt: new Date(payload.receivedAt),
  };
  await bus.publish(event);
}
