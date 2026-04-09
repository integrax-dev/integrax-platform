/**
 * EcommerceService
 *
 * Top-level facade for the ecommerce module.
 *
 * Write operations (create_catalog_item, create_cart, etc.) must be dispatched
 * through the operation-engine — this service is called from the dispatcher.
 *
 * Read operations are callable directly.
 *
 * Medusa is used where it saves time. If medusaAdapter is null (Medusa not
 * configured), the service falls back to the platform's own modules
 * (catalog, orders, inventory) for the operations it can handle natively.
 *
 * Platform core (event-bus, snapshot-store, timeline, reconciliation-engine)
 * is ALWAYS used — Medusa never replaces them.
 */

import { ulid } from '@integrax/entities';
import type { EventBus } from '@integrax/event-bus';
import type { SnapshotStore } from '@integrax/snapshot-store';
import { hashPayload } from '@integrax/snapshot-store';
import type { TimelineStore } from '@integrax/timeline';
import type { CatalogItem, Cart, DraftOrder, CheckoutSession, FulfillmentRequest, ReturnRequest } from './types.js';
import type { MedusaAdapter } from './medusa-adapter/adapter.js';

export class EcommerceService {
  constructor(
    private readonly store: SnapshotStore,
    private readonly bus: EventBus,
    private readonly timeline?: TimelineStore,
    private readonly medusa?: MedusaAdapter | null,
  ) {}

  // ─── Catalog ───────────────────────────────────────────────────────────────

  async listCatalogItems(tenantId: string, params?: {
    status?: CatalogItem['status'];
    limit?: number;
    offset?: number;
  }): Promise<CatalogItem[]> {
    if (this.medusa) {
      return this.medusa.listProducts({
        limit: params?.limit,
        offset: params?.offset,
        status: params?.status,
      });
    }
    // Fallback: load from snapshot store (populated by catalog connector polling/webhooks)
    const snaps = await this.store.list(tenantId, 'catalog_item', {
      ...(params?.limit ? { limit: params.limit } : {}),
    });
    return snaps.map(s => s.payload as unknown as CatalogItem);
  }

  async getCatalogItem(tenantId: string, id: string): Promise<CatalogItem | null> {
    if (this.medusa) return this.medusa.getProduct(id);
    const snap = await this.store.get(tenantId, 'catalog_item', id);
    return snap ? (snap.payload as unknown as CatalogItem) : null;
  }

  /** Called by operation-engine dispatcher after facade executes create */
  async ingestCatalogItem(tenantId: string, item: CatalogItem): Promise<CatalogItem> {
    const now = new Date();
    await this.store.upsert({
      snapshotId: ulid(),
      tenantId,
      entityType: 'catalog_item',
      canonicalId: item.id,
      externalIds: item.externalIds,
      payloadHash: hashPayload(item as unknown as Record<string, unknown>),
      payload: item as unknown as Record<string, unknown>,
      sourceSystem: item.externalIds[0]?.system ?? 'ecommerce',
      updatedAtSource: now,
      updatedAtSnapshot: now,
    });

    await this.bus.publish({
      id: ulid(),
      type: 'product.updated',
      tenantId,
      sourceSystem: 'ecommerce',
      entityType: 'catalog_item',
      entityId: item.id,
      payload: { id: item.id, title: item.title, status: item.status },
      occurredAt: now,
    });

    await this.timeline?.append(tenantId, {
      kind: 'sync',
      tenantId,
      occurredAt: now,
      entityType: 'catalog_item',
      canonicalId: item.id,
      sourceSystem: 'ecommerce',
      status: 'synced',
      actor: 'system',
    });

    return item;
  }

  // ─── Carts ─────────────────────────────────────────────────────────────────

  async getCart(tenantId: string, cartId: string): Promise<Cart | null> {
    if (this.medusa) return this.medusa.getCart(cartId);
    const snap = await this.store.get(tenantId, 'cart', cartId);
    return snap ? (snap.payload as unknown as Cart) : null;
  }

  async createCart(tenantId: string, params?: {
    salesChannelId?: string;
    currency?: string;
  }): Promise<Cart> {
    if (!this.medusa) throw new Error('createCart requires Medusa — configure medusaBaseUrl');
    return this.medusa.createCart(params);
  }

  async addLineItem(tenantId: string, cartId: string, variantId: string, quantity: number): Promise<Cart> {
    if (!this.medusa) throw new Error('addLineItem requires Medusa — configure medusaBaseUrl');
    const cart = await this.medusa.addLineItem(cartId, variantId, quantity);
    await this.persistCart(tenantId, cart);
    return cart;
  }

  async removeLineItem(tenantId: string, cartId: string, lineItemId: string): Promise<Cart> {
    if (!this.medusa) throw new Error('removeLineItem requires Medusa');
    const cart = await this.medusa.removeLineItem(cartId, lineItemId);
    await this.persistCart(tenantId, cart);
    return cart;
  }

  async applyPromotion(tenantId: string, cartId: string, discountCode: string): Promise<Cart> {
    if (!this.medusa) throw new Error('applyPromotion requires Medusa');
    const cart = await this.medusa.applyDiscount(cartId, discountCode);
    await this.persistCart(tenantId, cart);
    return cart;
  }

  async startCheckout(tenantId: string, cartId: string): Promise<CheckoutSession> {
    const cart = await this.getCart(tenantId, cartId);
    if (!cart) throw new Error(`Cart ${cartId} not found`);
    const session: CheckoutSession = {
      id: `cs_${ulid()}`,
      cartId,
      tenantId,
      status: 'payment_required',
      createdAt: new Date(),
    };
    await this.bus.publish({
      id: ulid(),
      type: 'order.created',
      tenantId,
      sourceSystem: 'ecommerce',
      entityType: 'checkout_session',
      entityId: session.id,
      payload: session,
      occurredAt: new Date(),
    });
    return session;
  }

  // ─── Fulfillment ───────────────────────────────────────────────────────────

  async requestFulfillment(tenantId: string, request: FulfillmentRequest): Promise<void> {
    const now = new Date();
    await this.bus.publish({
      id: ulid(),
      type: 'shipment.created',
      tenantId,
      sourceSystem: 'ecommerce',
      entityType: 'fulfillment_request',
      entityId: request.orderId,
      payload: request,
      occurredAt: now,
    });
    await this.timeline?.append(tenantId, {
      kind: 'sync',
      tenantId,
      occurredAt: now,
      entityType: 'fulfillment_request',
      canonicalId: request.orderId,
      sourceSystem: 'ecommerce',
      status: 'synced',
      actor: 'system',
    });
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private async persistCart(tenantId: string, cart: Cart): Promise<void> {
    const now = new Date();
    await this.store.upsert({
      snapshotId: ulid(),
      tenantId,
      entityType: 'cart',
      canonicalId: cart.id,
      externalIds: [{ system: 'medusa', id: cart.id }],
      payloadHash: hashPayload(cart as unknown as Record<string, unknown>),
      payload: cart as unknown as Record<string, unknown>,
      sourceSystem: 'medusa',
      updatedAtSource: now,
      updatedAtSnapshot: now,
    });
  }
}
