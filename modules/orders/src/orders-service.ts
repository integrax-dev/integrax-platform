import type { Order } from '@integrax/entities';
import { ulid } from '@integrax/entities';
import type { EventBus, IntegraxEvent } from '@integrax/event-bus';
import type { SnapshotStore } from '@integrax/snapshot-store';
import { hashPayload } from '@integrax/snapshot-store';
import type { TimelineStore } from '@integrax/timeline';
import type {
  OrdersModule,
  CreateOrderInput,
  UpdateOrderStatusInput,
  CancelOrderInput,
  GetOrderInput,
  ListOrdersInput,
} from './types.js';

export class OrdersService implements OrdersModule {
  constructor(
    private readonly store: SnapshotStore,
    private readonly bus: EventBus,
    private readonly timeline?: TimelineStore,
  ) {}

  async createOrder(input: CreateOrderInput): Promise<Order & { id: string }> {
    const id = ulid();
    const now = new Date();
    const order: Order & { id: string } = {
      ...input.order,
      id,
      createdAt: now,
      updatedAt: now,
      sourceSystem: input.sourceSystem,
    };

    const payloadHash = hashPayload(order as unknown as Record<string, unknown>);
    await this.store.upsert({
      snapshotId: ulid(),
      tenantId: input.tenantId,
      entityType: 'order',
      canonicalId: id,
      externalIds: order.externalIds,
      payloadHash,
      payload: order as unknown as Record<string, unknown>,
      sourceSystem: input.sourceSystem,
      updatedAtSource: now,
      updatedAtSnapshot: now,
    });

    await this.timeline?.append(input.tenantId, {
      kind: 'entity',
      tenantId: input.tenantId,
      occurredAt: now,
      entityType: 'order',
      canonicalId: id,
      sourceSystem: input.sourceSystem,
      deltas: [],
      previousHash: null,
      currentHash: payloadHash,
      actor: 'system',
    });

    await this.emit(input.tenantId, 'order.created', 'order', id, input.sourceSystem, order);
    return order;
  }

  async updateStatus(input: UpdateOrderStatusInput): Promise<void> {
    const snap = await this.store.get(input.tenantId, 'order', input.canonicalId);
    if (!snap) throw new Error(`Order not found: ${input.canonicalId}`);

    const now = new Date();
    const prevStatus = snap.payload['status'];
    const updated = { ...snap.payload, status: input.newStatus, updatedAt: now };
    const newHash = hashPayload(updated);

    await this.store.upsert({
      ...snap,
      snapshotId: ulid(),
      payload: updated,
      payloadHash: newHash,
      updatedAtSource: now,
      updatedAtSnapshot: now,
    });

    await this.timeline?.append(input.tenantId, {
      kind: 'entity',
      tenantId: input.tenantId,
      occurredAt: now,
      entityType: 'order',
      canonicalId: input.canonicalId,
      sourceSystem: input.sourceSystem,
      deltas: [{ field: 'status', before: prevStatus, after: input.newStatus }],
      previousHash: snap.payloadHash,
      currentHash: newHash,
      actor: 'system',
    });

    await this.emit(input.tenantId, 'order.status_changed', 'order', input.canonicalId, input.sourceSystem, {
      canonicalId: input.canonicalId,
      previousStatus: prevStatus,
      newStatus: input.newStatus,
      reason: input.reason,
    });
  }

  async cancelOrder(input: CancelOrderInput): Promise<void> {
    await this.updateStatus({
      tenantId: input.tenantId,
      canonicalId: input.canonicalId,
      sourceSystem: input.sourceSystem,
      newStatus: 'cancelled',
      reason: input.reason,
    });
    await this.emit(input.tenantId, 'order.cancelled', 'order', input.canonicalId, input.sourceSystem, {
      canonicalId: input.canonicalId,
      reason: input.reason,
    });
  }

  async getOrder(input: GetOrderInput): Promise<Order | null> {
    const snap = await this.store.get(input.tenantId, 'order', input.canonicalId);
    return snap ? (snap.payload as unknown as Order) : null;
  }

  async listOrders(input: ListOrdersInput): Promise<Order[]> {
    const snaps = await this.store.list(input.tenantId, 'order', {
      sourceSystem: input.sourceSystem,
      since: input.since,
      limit: input.limit,
    });
    return snaps
      .map(s => s.payload as unknown as Order)
      .filter(o => !input.status || o.status === input.status);
  }

  private async emit(
    tenantId: string,
    type: IntegraxEvent['type'],
    entityType: string,
    entityId: string,
    sourceSystem: string,
    payload: unknown,
  ): Promise<void> {
    await this.bus.publish({
      id: ulid(),
      type,
      tenantId,
      sourceSystem,
      entityType,
      entityId,
      payload,
      occurredAt: new Date(),
    });
  }
}
