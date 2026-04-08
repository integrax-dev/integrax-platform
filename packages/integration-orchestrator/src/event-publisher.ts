/**
 * Event Publisher
 *
 * Publishes typed domain events to the event-bus when an entity changes.
 * Maps entity types to the correct IntegraxEventType.
 */

import { ulid } from '@integrax/entities';
import type { EventBus } from '@integrax/event-bus';
import type { EntitySnapshot } from '@integrax/snapshot-store';

// Maps canonical entity types to the most specific IntegraxEventType available.
// All values must exist in IntegraxEventType (event-bus/src/event-types.ts).
const ENTITY_CHANGED_EVENTS: Record<string, string> = {
  order:    'order.updated',
  payment:  'snapshot.updated',   // no payment.* type yet
  invoice:  'invoice.created',    // webhooks typically fire on new invoices
  product:  'product.updated',
  customer: 'customer.updated',
  stock:    'stock.changed',
  row:      'snapshot.updated',   // generic google-sheets row
};

export class EventPublisher {
  constructor(private readonly bus: EventBus) {}

  async publishSnapshotUpdated(
    tenantId: string,
    snapshot: EntitySnapshot,
  ): Promise<void> {
    const eventType =
      ENTITY_CHANGED_EVENTS[snapshot.entityType] ?? 'entity.updated';

    await this.bus.publish({
      id: ulid(),
      type: eventType as any,
      tenantId,
      sourceSystem: snapshot.sourceSystem,
      entityType: snapshot.entityType,
      entityId: snapshot.canonicalId,
      occurredAt: new Date(),
      payload: {
        canonicalId: snapshot.canonicalId,
        entityType: snapshot.entityType,
        sourceSystem: snapshot.sourceSystem,
        snapshotId: snapshot.snapshotId,
        payloadHash: snapshot.payloadHash,
      },
    });
  }
}
