/**
 * PaymentService
 *
 * Handles the core payment lifecycle: create, authorize, capture, refund, cancel.
 *
 * This service does NOT call PSP APIs directly. All external execution goes
 * through the connector facade (via the operation-engine in the full flow).
 * Here we manage canonical state (snapshot-store), events, and timeline.
 *
 * For operation-engine-backed flows (recommended for mutations), callers should
 * submit a payment command rather than calling this service directly.
 * Direct calls are appropriate for read-queries and state sync from webhooks.
 */

import type { Payment, Refund } from '@integrax/entities';
import { ulid } from '@integrax/entities';
import type { EventBus, IntegraxEvent } from '@integrax/event-bus';
import type { SnapshotStore } from '@integrax/snapshot-store';
import { hashPayload } from '@integrax/snapshot-store';
import type { TimelineStore } from '@integrax/timeline';
import type {
  CreatePaymentInput,
  RefundPaymentInput,
  GetPaymentInput,
  ListPaymentsInput,
} from './types.js';

export class PaymentService {
  constructor(
    private readonly store: SnapshotStore,
    private readonly bus: EventBus,
    private readonly timeline?: TimelineStore,
  ) {}

  // ─── State ingestion (from webhook / polling) ─────────────────────────────

  /**
   * Upserts a canonical Payment from an inbound webhook or poll result.
   * This is NOT the same as initiating a payment through the PSP.
   */
  async ingestPayment(
    tenantId: string,
    payment: Payment & { canonicalId: string },
  ): Promise<void> {
    const now = new Date();
    const previous = await this.store.get(tenantId, 'payment', payment.canonicalId);
    const payloadHash = hashPayload(payment as unknown as Record<string, unknown>);

    if (previous && previous.payloadHash === payloadHash) return; // no change

    await this.store.upsert({
      snapshotId: ulid(),
      tenantId,
      entityType: 'payment',
      canonicalId: payment.canonicalId,
      externalIds: payment.externalIds,
      payloadHash,
      payload: payment as unknown as Record<string, unknown>,
      sourceSystem: payment.sourceSystem,
      updatedAtSource: payment.updatedAt,
      updatedAtSnapshot: now,
    });

    await this.timeline?.append(tenantId, {
      kind: 'entity',
      tenantId,
      occurredAt: now,
      entityType: 'payment',
      canonicalId: payment.canonicalId,
      sourceSystem: payment.sourceSystem,
      deltas: previous
        ? [{ field: 'status', before: previous.payload['status'], after: payment.status }]
        : [],
      previousHash: previous?.payloadHash ?? null,
      currentHash: payloadHash,
      actor: 'connector',
    });

    const eventType = this.statusToEventType(payment.status);
    await this.emit(tenantId, eventType, 'payment', payment.canonicalId, payment.sourceSystem, payment);
  }

  /**
   * Creates a placeholder canonical Payment record before PSP confirmation.
   * Called by the operation-engine dispatcher after a successful create_payment facade call.
   */
  async createPaymentRecord(
    tenantId: string,
    input: CreatePaymentInput,
    externalId: string,
    initialStatus: Payment['status'] = 'pending',
  ): Promise<Payment & { canonicalId: string }> {
    const canonicalId = ulid();
    const now = new Date();
    const payment: Payment & { canonicalId: string } = {
      canonicalId,
      externalIds: [{ system: input.connectorId, id: externalId }],
      provider: input.connectorId,
      amount: input.amount,
      currency: input.currency,
      status: initialStatus,
      methodType: input.methodType,
      installments: input.installments,
      orderId: input.orderId,
      invoiceId: input.invoiceId,
      subscriptionId: input.subscriptionId,
      description: input.description,
      idempotencyKey: input.idempotencyKey,
      sourceSystem: input.sourceSystem,
      createdAt: now,
      updatedAt: now,
      metadata: input.metadata,
    };

    await this.ingestPayment(tenantId, payment);
    return payment;
  }

  async updatePaymentStatus(
    tenantId: string,
    canonicalId: string,
    newStatus: Payment['status'],
    _sourceSystem: string,
    extra: Partial<Payment> = {},
  ): Promise<void> {
    const snap = await this.store.get(tenantId, 'payment', canonicalId);
    if (!snap) throw new Error(`Payment not found: ${canonicalId}`);

    const now = new Date();
    const updated: Payment & { canonicalId: string } = {
      ...(snap.payload as unknown as Payment & { canonicalId: string }),
      ...extra,
      status: newStatus,
      updatedAt: now,
    };
    await this.ingestPayment(tenantId, updated);
  }

  async createRefundRecord(
    tenantId: string,
    input: RefundPaymentInput,
    externalRefundId: string,
  ): Promise<Refund & { canonicalId: string }> {
    const canonicalId = ulid();
    const now = new Date();
    const refund: Refund & { canonicalId: string } = {
      canonicalId,
      externalIds: [{ system: input.connectorId, id: externalRefundId }],
      paymentId: input.canonicalId,
      provider: input.connectorId,
      amount: input.amount ?? 0,
      currency: 'unknown', // filled from payment snapshot in real flow
      status: 'pending',
      reason: input.reason,
      note: input.note,
      sourceSystem: input.sourceSystem,
      createdAt: now,
      updatedAt: now,
    };

    const payloadHash = hashPayload(refund as unknown as Record<string, unknown>);
    await this.store.upsert({
      snapshotId: ulid(),
      tenantId,
      entityType: 'refund',
      canonicalId,
      externalIds: refund.externalIds,
      payloadHash,
      payload: refund as unknown as Record<string, unknown>,
      sourceSystem: input.sourceSystem,
      updatedAtSource: now,
      updatedAtSnapshot: now,
    });

    await this.timeline?.append(tenantId, {
      kind: 'entity',
      tenantId,
      occurredAt: now,
      entityType: 'refund',
      canonicalId,
      sourceSystem: input.sourceSystem,
      deltas: [],
      previousHash: null,
      currentHash: payloadHash,
      actor: 'user',
    });

    await this.emit(tenantId, 'payment.refunded', 'refund', canonicalId, input.sourceSystem, refund);
    return refund;
  }

  // ─── Queries ──────────────────────────────────────────────────────────────

  async getPayment(input: GetPaymentInput): Promise<Payment | null> {
    const snap = await this.store.get(input.tenantId, 'payment', input.canonicalId);
    return snap ? (snap.payload as unknown as Payment) : null;
  }

  async listPayments(input: ListPaymentsInput): Promise<Payment[]> {
    const snaps = await this.store.list(input.tenantId, 'payment', {
      sourceSystem: input.sourceSystem,
      since: input.since,
      limit: input.limit,
    });
    return snaps
      .map(s => s.payload as unknown as Payment)
      .filter(p => {
        if (input.status && p.status !== input.status) return false;
        if (input.connectorId && p.provider !== input.connectorId) return false;
        if (input.orderId && p.orderId !== input.orderId) return false;
        if (input.invoiceId && p.invoiceId !== input.invoiceId) return false;
        return true;
      });
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private statusToEventType(status: Payment['status']): IntegraxEvent['type'] {
    const map: Record<string, IntegraxEvent['type']> = {
      pending: 'payment.created',
      authorized: 'payment.authorized',
      captured: 'payment.captured',
      approved: 'payment.approved',
      rejected: 'payment.failed',
      cancelled: 'payment.cancelled',
      refunded: 'payment.refunded',
      partially_refunded: 'payment.partially_refunded',
      chargeback: 'payment.chargeback',
      expired: 'payment.expired',
      in_process: 'payment.updated',
    };
    return map[status] ?? 'payment.updated';
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
