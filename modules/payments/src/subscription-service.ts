/**
 * SubscriptionService
 *
 * Manages recurring billing agreements across any PSP.
 * Provider-specific plan management lives in the connector facade.
 */

import type { Subscription } from '@integrax/entities';
import { ulid } from '@integrax/entities';
import type { EventBus, IntegraxEvent } from '@integrax/event-bus';
import type { SnapshotStore } from '@integrax/snapshot-store';
import { hashPayload } from '@integrax/snapshot-store';
import type { TimelineStore } from '@integrax/timeline';
import type {
  CreateSubscriptionInput,
  CancelSubscriptionInput,
  GetSubscriptionInput,
  ListSubscriptionsInput,
} from './types.js';

export class SubscriptionService {
  constructor(
    private readonly store: SnapshotStore,
    private readonly bus: EventBus,
    private readonly timeline?: TimelineStore,
  ) {}

  async ingestSubscription(
    tenantId: string,
    subscription: Subscription & { canonicalId: string },
  ): Promise<void> {
    const now = new Date();
    const previous = await this.store.get(tenantId, 'subscription', subscription.canonicalId);
    const payloadHash = hashPayload(subscription as unknown as Record<string, unknown>);

    if (previous && previous.payloadHash === payloadHash) return;

    await this.store.upsert({
      snapshotId: ulid(),
      tenantId,
      entityType: 'subscription',
      canonicalId: subscription.canonicalId,
      externalIds: subscription.externalIds,
      payloadHash,
      payload: subscription as unknown as Record<string, unknown>,
      sourceSystem: subscription.sourceSystem,
      updatedAtSource: subscription.updatedAt,
      updatedAtSnapshot: now,
    });

    await this.timeline?.append(tenantId, {
      kind: 'entity',
      tenantId,
      occurredAt: now,
      entityType: 'subscription',
      canonicalId: subscription.canonicalId,
      sourceSystem: subscription.sourceSystem,
      deltas: previous
        ? [{ field: 'status', before: previous.payload['status'], after: subscription.status }]
        : [],
      previousHash: previous?.payloadHash ?? null,
      currentHash: payloadHash,
      actor: 'connector',
    });

    const eventType = this.statusToEventType(subscription.status, !previous);
    await this.emit(tenantId, eventType, 'subscription', subscription.canonicalId, subscription.sourceSystem, subscription);
  }

  async createSubscriptionRecord(
    tenantId: string,
    input: CreateSubscriptionInput,
    externalId: string,
  ): Promise<Subscription & { canonicalId: string }> {
    const canonicalId = ulid();
    const now = new Date();
    const subscription: Subscription & { canonicalId: string } = {
      canonicalId,
      externalIds: [{ system: input.connectorId, id: externalId }],
      provider: input.connectorId,
      planId: input.planId,
      planName: input.planName,
      customerId: input.customerId,
      paymentMethodId: input.paymentMethodId,
      status: 'pending',
      amount: input.amount,
      currency: input.currency,
      billingFrequency: input.billingFrequency,
      billingIntervalDays: input.billingIntervalDays,
      maxCycles: input.maxCycles,
      startedAt: input.startedAt,
      trialEndsAt: input.trialEndsAt,
      sourceSystem: input.sourceSystem,
      createdAt: now,
      updatedAt: now,
      metadata: input.metadata,
    };
    await this.ingestSubscription(tenantId, subscription);
    return subscription;
  }

  async cancelSubscriptionRecord(
    tenantId: string,
    input: CancelSubscriptionInput,
  ): Promise<void> {
    const snap = await this.store.get(tenantId, 'subscription', input.canonicalId);
    if (!snap) throw new Error(`Subscription not found: ${input.canonicalId}`);

    const now = new Date();
    const updated: Subscription & { canonicalId: string } = {
      ...(snap.payload as unknown as Subscription & { canonicalId: string }),
      status: 'cancelled',
      cancelledAt: now,
      cancellationReason: input.reason,
      updatedAt: now,
    };
    await this.ingestSubscription(tenantId, updated);
  }

  async getSubscription(input: GetSubscriptionInput): Promise<Subscription | null> {
    const snap = await this.store.get(input.tenantId, 'subscription', input.canonicalId);
    return snap ? (snap.payload as unknown as Subscription) : null;
  }

  async listSubscriptions(input: ListSubscriptionsInput): Promise<Subscription[]> {
    const snaps = await this.store.list(input.tenantId, 'subscription', {
      sourceSystem: input.sourceSystem,
      limit: input.limit,
    });
    return snaps
      .map(s => s.payload as unknown as Subscription)
      .filter(s => {
        if (input.status && s.status !== input.status) return false;
        if (input.customerId && s.customerId !== input.customerId) return false;
        return true;
      });
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private statusToEventType(status: Subscription['status'], isNew: boolean): IntegraxEvent['type'] {
    if (isNew) return 'subscription.created';
    const map: Record<string, IntegraxEvent['type']> = {
      active: 'subscription.activated',
      past_due: 'subscription.past_due',
      cancelled: 'subscription.cancelled',
      expired: 'subscription.expired',
    };
    return map[status] ?? 'subscription.updated';
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
