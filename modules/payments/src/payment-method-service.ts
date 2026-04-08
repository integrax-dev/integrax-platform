/**
 * PaymentMethodService
 *
 * Manages tokenized payment instruments.
 * Sensitive card data NEVER enters this layer — only PSP tokens.
 */

import type { PaymentMethod } from '@integrax/entities';
import { ulid } from '@integrax/entities';
import type { EventBus } from '@integrax/event-bus';
import type { SnapshotStore } from '@integrax/snapshot-store';
import { hashPayload } from '@integrax/snapshot-store';
import type { TimelineStore } from '@integrax/timeline';
import type { TokenizePaymentMethodInput } from './types.js';

export class PaymentMethodService {
  constructor(
    private readonly store: SnapshotStore,
    private readonly bus: EventBus,
    private readonly timeline?: TimelineStore,
  ) {}

  /**
   * Stores a tokenized payment method record returned by a PSP after tokenization.
   * The `token` field is the PSP's own opaque reference — never raw PAN.
   */
  async ingestPaymentMethod(
    tenantId: string,
    method: PaymentMethod & { canonicalId: string },
  ): Promise<void> {
    const now = new Date();
    const payloadHash = hashPayload(method as unknown as Record<string, unknown>);

    await this.store.upsert({
      snapshotId: ulid(),
      tenantId,
      entityType: 'payment_method',
      canonicalId: method.canonicalId,
      externalIds: method.externalIds,
      payloadHash,
      payload: method as unknown as Record<string, unknown>,
      sourceSystem: method.sourceSystem,
      updatedAtSource: method.updatedAt,
      updatedAtSnapshot: now,
    });

    await this.timeline?.append(tenantId, {
      kind: 'entity',
      tenantId,
      occurredAt: now,
      entityType: 'payment_method',
      canonicalId: method.canonicalId,
      sourceSystem: method.sourceSystem,
      deltas: [],
      previousHash: null,
      currentHash: payloadHash,
      actor: 'connector',
    });

    await this.bus.publish({
      id: ulid(),
      type: 'payment.method.tokenized',
      tenantId,
      sourceSystem: method.sourceSystem,
      entityType: 'payment_method',
      entityId: method.canonicalId,
      payload: { canonicalId: method.canonicalId, provider: method.provider, type: method.type, brand: method.brand, last4: method.last4 },
      occurredAt: now,
    });
  }

  async createFromTokenization(
    tenantId: string,
    input: TokenizePaymentMethodInput,
    pspToken: string,
    details: Partial<PaymentMethod> = {},
  ): Promise<PaymentMethod & { canonicalId: string }> {
    const canonicalId = ulid();
    const now = new Date();
    const method: PaymentMethod & { canonicalId: string } = {
      canonicalId,
      externalIds: [{ system: input.connectorId, id: pspToken }],
      provider: input.connectorId,
      type: details.type ?? 'credit_card',
      brand: details.brand,
      last4: details.last4,
      expirationMonth: details.expirationMonth,
      expirationYear: details.expirationYear,
      holderName: details.holderName,
      tokenReference: pspToken,
      reusable: details.reusable ?? true,
      customerId: input.customerId,
      sourceSystem: input.sourceSystem,
      createdAt: now,
      updatedAt: now,
      metadata: input.metadata,
    };
    await this.ingestPaymentMethod(tenantId, method);
    return method;
  }

  async getPaymentMethod(tenantId: string, canonicalId: string): Promise<PaymentMethod | null> {
    const snap = await this.store.get(tenantId, 'payment_method', canonicalId);
    return snap ? (snap.payload as unknown as PaymentMethod) : null;
  }

  async listPaymentMethods(tenantId: string, customerId?: string): Promise<PaymentMethod[]> {
    const snaps = await this.store.list(tenantId, 'payment_method');
    const methods = snaps.map(s => s.payload as unknown as PaymentMethod);
    if (customerId) return methods.filter(m => m.customerId === customerId);
    return methods;
  }
}
