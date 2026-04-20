/**
 * EcommerceService
 *
 * Full headless commerce backend built on the platform's own infrastructure
 * (SnapshotStore, EventBus, Timeline). Medusa is an optional accelerator —
 * if null, every operation runs natively.
 *
 * Native capabilities:
 *   Catalog   — ingest, list, get, update status
 *   Carts     — create, add/remove/update line items, set addresses
 *   Discounts — create, apply (percentage / fixed / free_shipping), validate
 *   Checkout  — start session, complete
 *   Customers — create account, get, update
 *   Orders    — create draft order from cart, cancel
 *   Fulfillment — request, track
 *   Returns   — request return
 */

import { ulid } from '@integrax/entities';
import type { EventBus } from '@integrax/event-bus';
import type { SnapshotStore } from '@integrax/snapshot-store';
import { hashPayload } from '@integrax/snapshot-store';
import type { TimelineStore } from '@integrax/timeline';
import type {
  CatalogItem, Variant, Cart, LineItem, Address,
  CheckoutSession, Discount, DiscountRule,
  CustomerAccount, DraftOrder, FulfillmentRequest, ReturnRequest,
} from './types.js';
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
      return this.medusa.listProducts({ limit: params?.limit, offset: params?.offset, status: params?.status });
    }
    const snaps = await this.store.list(tenantId, 'catalog_item', { limit: params?.limit });
    const items = snaps.map(s => s.payload as unknown as CatalogItem);
    return params?.status ? items.filter(i => i.status === params.status) : items;
  }

  async getCatalogItem(tenantId: string, id: string): Promise<CatalogItem | null> {
    if (this.medusa) return this.medusa.getProduct(id);
    const snap = await this.store.get(tenantId, 'catalog_item', id);
    return snap ? (snap.payload as unknown as CatalogItem) : null;
  }

  async ingestCatalogItem(tenantId: string, item: CatalogItem): Promise<CatalogItem> {
    const now = new Date();
    const id = item.id ?? ulid();
    const record: CatalogItem = { ...item, id, tenantId, updatedAt: now };
    await this.store.upsert({
      snapshotId: ulid(), tenantId,
      entityType: 'catalog_item', canonicalId: id,
      externalIds: item.externalIds,
      payloadHash: hashPayload(record as unknown as Record<string, unknown>),
      payload: record as unknown as Record<string, unknown>,
      sourceSystem: item.externalIds[0]?.system ?? 'ecommerce',
      updatedAtSource: now, updatedAtSnapshot: now,
    });
    await this.bus.publish({
      id: ulid(), type: 'product.updated', tenantId, sourceSystem: 'ecommerce',
      entityType: 'catalog_item', entityId: item.id,
      payload: { id: item.id, title: item.title, status: item.status },
      occurredAt: now,
    });
    await this._syncEntry(tenantId, 'catalog_item', now);
    return record;
  }

  async updateCatalogItemStatus(tenantId: string, id: string, status: CatalogItem['status']): Promise<CatalogItem> {
    const item = await this.getCatalogItem(tenantId, id);
    if (!item) throw new Error(`Catalog item ${id} not found`);
    return this.ingestCatalogItem(tenantId, { ...item, status });
  }

  // ─── Carts ─────────────────────────────────────────────────────────────────

  async createCart(tenantId: string, params?: {
    salesChannelId?: string;
    currency?: string;
    customerId?: string;
    email?: string;
  }): Promise<Cart> {
    if (this.medusa) return this.medusa.createCart(params);
    const now = new Date();
    const cart: Cart = {
      id: `cart_${ulid()}`,
      tenantId,
      salesChannelId: params?.salesChannelId,
      customerId: params?.customerId,
      email: params?.email,
      currency: params?.currency ?? 'ARS',
      lineItems: [],
      discounts: [],
      subtotal: 0, discountTotal: 0, shippingTotal: 0, taxTotal: 0, total: 0,
      createdAt: now, updatedAt: now,
    };
    await this._persistCart(tenantId, cart);
    return cart;
  }

  async getCart(tenantId: string, cartId: string): Promise<Cart | null> {
    if (this.medusa) return this.medusa.getCart(cartId);
    const snap = await this.store.get(tenantId, 'cart', cartId);
    return snap ? (snap.payload as unknown as Cart) : null;
  }

  async addLineItem(tenantId: string, cartId: string, variantId: string, quantity: number): Promise<Cart> {
    if (this.medusa) {
      const cart = await this.medusa.addLineItem(cartId, variantId, quantity);
      await this._persistCart(tenantId, cart);
      return cart;
    }
    const cart = await this._requireCart(tenantId, cartId);

    // Resolve variant price from catalog
    const unitPrice = await this._resolveVariantPrice(tenantId, variantId, cart.currency);

    const existing = cart.lineItems.find(l => l.variantId === variantId);
    if (existing) {
      existing.quantity += quantity;
      existing.total = existing.unitPrice * existing.quantity;
    } else {
      const variant = await this._resolveVariant(tenantId, variantId);
      cart.lineItems.push({
        id: `li_${ulid()}`,
        cartId,
        variantId,
        title: variant?.title ?? variantId,
        quantity,
        unitPrice,
        total: unitPrice * quantity,
      });
    }

    return this._saveCart(tenantId, cart);
  }

  async updateLineItemQuantity(tenantId: string, cartId: string, lineItemId: string, quantity: number): Promise<Cart> {
    const cart = await this._requireCart(tenantId, cartId);
    const item = cart.lineItems.find(l => l.id === lineItemId);
    if (!item) throw new Error(`Line item ${lineItemId} not found in cart ${cartId}`);
    if (quantity <= 0) {
      cart.lineItems = cart.lineItems.filter(l => l.id !== lineItemId);
    } else {
      item.quantity = quantity;
      item.total = item.unitPrice * quantity;
    }
    return this._saveCart(tenantId, cart);
  }

  async removeLineItem(tenantId: string, cartId: string, lineItemId: string): Promise<Cart> {
    if (this.medusa) {
      const cart = await this.medusa.removeLineItem(cartId, lineItemId);
      await this._persistCart(tenantId, cart);
      return cart;
    }
    return this.updateLineItemQuantity(tenantId, cartId, lineItemId, 0);
  }

  async setShippingAddress(tenantId: string, cartId: string, address: Address): Promise<Cart> {
    const cart = await this._requireCart(tenantId, cartId);
    cart.shippingAddress = address;
    return this._saveCart(tenantId, cart);
  }

  async setBillingAddress(tenantId: string, cartId: string, address: Address): Promise<Cart> {
    const cart = await this._requireCart(tenantId, cartId);
    cart.billingAddress = address;
    return this._saveCart(tenantId, cart);
  }

  async setCartEmail(tenantId: string, cartId: string, email: string): Promise<Cart> {
    const cart = await this._requireCart(tenantId, cartId);
    cart.email = email;
    return this._saveCart(tenantId, cart);
  }

  // ─── Discounts / Promotions ────────────────────────────────────────────────

  async createDiscount(tenantId: string, discount: Omit<Discount, 'id' | 'usageCount'>): Promise<Discount> {
    const now = new Date();
    const record: Discount = { ...discount, id: `disc_${ulid()}`, usageCount: 0 };
    await this.store.upsert({
      snapshotId: ulid(), tenantId,
      entityType: 'discount', canonicalId: record.id,
      externalIds: [{ system: 'ecommerce', id: record.id }],
      payloadHash: hashPayload(record as unknown as Record<string, unknown>),
      payload: record as unknown as Record<string, unknown>,
      sourceSystem: 'ecommerce',
      updatedAtSource: now, updatedAtSnapshot: now,
    });
    return record;
  }

  async getDiscount(tenantId: string, code: string): Promise<Discount | null> {
    const snaps = await this.store.list(tenantId, 'discount');
    const snap = snaps.find(s => (s.payload as unknown as Discount).code === code);
    return snap ? (snap.payload as unknown as Discount) : null;
  }

  async listDiscounts(tenantId: string): Promise<Discount[]> {
    const snaps = await this.store.list(tenantId, 'discount');
    return snaps.map(s => s.payload as unknown as Discount);
  }

  async applyPromotion(tenantId: string, cartId: string, discountCode: string): Promise<Cart> {
    if (this.medusa) {
      const cart = await this.medusa.applyDiscount(cartId, discountCode);
      await this._persistCart(tenantId, cart);
      return cart;
    }
    const cart = await this._requireCart(tenantId, cartId);
    const discount = await this.getDiscount(tenantId, discountCode);
    if (!discount) throw new Error(`Discount code '${discountCode}' not found`);
    if (discount.isDisabled) throw new Error(`Discount code '${discountCode}' is disabled`);
    if (discount.usageLimit && discount.usageCount >= discount.usageLimit) {
      throw new Error(`Discount code '${discountCode}' has reached its usage limit`);
    }
    const now = new Date();
    if (discount.startsAt && discount.startsAt > now) throw new Error(`Discount code '${discountCode}' is not yet active`);
    if (discount.endsAt && discount.endsAt < now) throw new Error(`Discount code '${discountCode}' has expired`);

    // Deduplicate — one code per cart
    if (!cart.discounts.find(d => d.code === discountCode)) {
      cart.discounts.push(discount);
    }
    return this._saveCart(tenantId, cart);
  }

  async removePromotion(tenantId: string, cartId: string, discountCode: string): Promise<Cart> {
    const cart = await this._requireCart(tenantId, cartId);
    cart.discounts = cart.discounts.filter(d => d.code !== discountCode);
    return this._saveCart(tenantId, cart);
  }

  // ─── Checkout ──────────────────────────────────────────────────────────────

  async startCheckout(tenantId: string, cartId: string): Promise<CheckoutSession> {
    const cart = await this._requireCart(tenantId, cartId);
    const session: CheckoutSession = {
      id: `cs_${ulid()}`,
      cartId,
      tenantId,
      status: 'payment_required',
      createdAt: new Date(),
    };
    await this.bus.publish({
      id: ulid(), type: 'order.created', tenantId, sourceSystem: 'ecommerce',
      entityType: 'checkout_session', entityId: session.id,
      payload: { ...session, cartTotal: cart.total },
      occurredAt: new Date(),
    });
    return session;
  }

  async completeCheckout(tenantId: string, sessionId: string, paymentSessionId?: string): Promise<CheckoutSession & { order: DraftOrder }> {
    // Mark session completed + convert cart to draft order
    const snaps = await this.store.list(tenantId, 'cart');
    const cartSnap = snaps.find(s => {
      const sessions = (s.payload as Record<string, unknown>)['checkoutSessionId'];
      return sessions === sessionId;
    });

    const now = new Date();
    const session: CheckoutSession = {
      id: sessionId, cartId: cartSnap?.canonicalId ?? 'unknown',
      tenantId, status: 'completed', paymentSessionId, completedAt: now, createdAt: now,
    };

    const cart = cartSnap ? (cartSnap.payload as unknown as Cart) : null;
    const order = await this.createDraftOrder(tenantId, {
      cartId: cart?.id,
      customerId: cart?.customerId,
      lineItems: cart?.lineItems ?? [],
      currency: cart?.currency ?? 'ARS',
      total: cart?.total ?? 0,
    });

    await this.bus.publish({
      id: ulid(), type: 'order.updated', tenantId, sourceSystem: 'ecommerce',
      entityType: 'order', entityId: order.id,
      payload: { orderId: order.id, sessionId, status: 'completed' },
      occurredAt: now,
    });

    return { ...session, order };
  }

  // ─── Customer Accounts ────────────────────────────────────────────────────

  async createCustomerAccount(tenantId: string, input: Omit<CustomerAccount, 'id' | 'createdAt'>): Promise<CustomerAccount> {
    const now = new Date();
    const account: CustomerAccount = { ...input, id: `cust_${ulid()}`, createdAt: now };
    await this.store.upsert({
      snapshotId: ulid(), tenantId,
      entityType: 'customer_account', canonicalId: account.id,
      externalIds: [{ system: 'ecommerce', id: account.id }],
      payloadHash: hashPayload(account as unknown as Record<string, unknown>),
      payload: account as unknown as Record<string, unknown>,
      sourceSystem: 'ecommerce',
      updatedAtSource: now, updatedAtSnapshot: now,
    });
    await this.bus.publish({
      id: ulid(), type: 'customer.created', tenantId, sourceSystem: 'ecommerce',
      entityType: 'customer_account', entityId: account.id,
      payload: { id: account.id, email: account.email },
      occurredAt: now,
    });
    return account;
  }

  async getCustomerAccount(tenantId: string, id: string): Promise<CustomerAccount | null> {
    const snap = await this.store.get(tenantId, 'customer_account', id);
    return snap ? (snap.payload as unknown as CustomerAccount) : null;
  }

  async getCustomerByEmail(tenantId: string, email: string): Promise<CustomerAccount | null> {
    const snaps = await this.store.list(tenantId, 'customer_account');
    const snap = snaps.find(s => (s.payload as unknown as CustomerAccount).email === email);
    return snap ? (snap.payload as unknown as CustomerAccount) : null;
  }

  async updateCustomerAccount(tenantId: string, id: string, patch: Partial<Omit<CustomerAccount, 'id' | 'createdAt'>>): Promise<CustomerAccount> {
    const account = await this.getCustomerAccount(tenantId, id);
    if (!account) throw new Error(`Customer account ${id} not found`);
    const now = new Date();
    const updated = { ...account, ...patch };
    await this.store.upsert({
      snapshotId: ulid(), tenantId,
      entityType: 'customer_account', canonicalId: id,
      externalIds: [{ system: 'ecommerce', id }],
      payloadHash: hashPayload(updated as unknown as Record<string, unknown>),
      payload: updated as unknown as Record<string, unknown>,
      sourceSystem: 'ecommerce',
      updatedAtSource: now, updatedAtSnapshot: now,
    });
    return updated;
  }

  // ─── Draft Orders ─────────────────────────────────────────────────────────

  async createDraftOrder(tenantId: string, input: Pick<DraftOrder, 'cartId' | 'customerId' | 'lineItems' | 'currency' | 'total'>): Promise<DraftOrder> {
    const now = new Date();
    const order: DraftOrder = {
      id: `ord_${ulid()}`,
      tenantId,
      status: 'open',
      cartId: input.cartId,
      customerId: input.customerId,
      lineItems: input.lineItems,
      currency: input.currency,
      total: input.total,
      createdAt: now,
    };
    await this.store.upsert({
      snapshotId: ulid(), tenantId,
      entityType: 'draft_order', canonicalId: order.id,
      externalIds: [{ system: 'ecommerce', id: order.id }],
      payloadHash: hashPayload(order as unknown as Record<string, unknown>),
      payload: order as unknown as Record<string, unknown>,
      sourceSystem: 'ecommerce',
      updatedAtSource: now, updatedAtSnapshot: now,
    });
    return order;
  }

  async getDraftOrder(tenantId: string, id: string): Promise<DraftOrder | null> {
    const snap = await this.store.get(tenantId, 'draft_order', id);
    return snap ? (snap.payload as unknown as DraftOrder) : null;
  }

  async listDraftOrders(tenantId: string, params?: { status?: DraftOrder['status']; limit?: number }): Promise<DraftOrder[]> {
    const snaps = await this.store.list(tenantId, 'draft_order', { limit: params?.limit });
    const orders = snaps.map(s => s.payload as unknown as DraftOrder);
    return params?.status ? orders.filter(o => o.status === params.status) : orders;
  }

  async cancelDraftOrder(tenantId: string, id: string): Promise<DraftOrder> {
    const order = await this.getDraftOrder(tenantId, id);
    if (!order) throw new Error(`Draft order ${id} not found`);
    if (order.status === 'completed') throw new Error(`Order ${id} is already completed and cannot be cancelled`);
    const now = new Date();
    const updated = { ...order, status: 'canceled' as const };
    await this.store.upsert({
      snapshotId: ulid(), tenantId,
      entityType: 'draft_order', canonicalId: id,
      externalIds: [{ system: 'ecommerce', id }],
      payloadHash: hashPayload(updated as unknown as Record<string, unknown>),
      payload: updated as unknown as Record<string, unknown>,
      sourceSystem: 'ecommerce',
      updatedAtSource: now, updatedAtSnapshot: now,
    });
    await this.bus.publish({
      id: ulid(), type: 'order.status_changed', tenantId, sourceSystem: 'ecommerce',
      entityType: 'draft_order', entityId: id,
      payload: { orderId: id, status: 'canceled' },
      occurredAt: now,
    });
    return updated;
  }

  // ─── Fulfillment ───────────────────────────────────────────────────────────

  async requestFulfillment(tenantId: string, request: FulfillmentRequest): Promise<void> {
    const now = new Date();
    await this.bus.publish({
      id: ulid(), type: 'shipment.created', tenantId, sourceSystem: 'ecommerce',
      entityType: 'fulfillment_request', entityId: request.orderId,
      payload: request, occurredAt: now,
    });
    await this._syncEntry(tenantId, 'fulfillment_request', now);
  }

  // ─── Returns ──────────────────────────────────────────────────────────────

  async requestReturn(tenantId: string, request: ReturnRequest): Promise<{ id: string; status: 'requested' }> {
    const now = new Date();
    const returnId = `ret_${ulid()}`;
    const record = { id: returnId, ...request, status: 'requested' as const, createdAt: now };
    await this.store.upsert({
      snapshotId: ulid(), tenantId,
      entityType: 'return_request', canonicalId: returnId,
      externalIds: [{ system: 'ecommerce', id: returnId }],
      payloadHash: hashPayload(record as unknown as Record<string, unknown>),
      payload: record as unknown as Record<string, unknown>,
      sourceSystem: 'ecommerce',
      updatedAtSource: now, updatedAtSnapshot: now,
    });
    await this.bus.publish({
      id: ulid(), type: 'shipment.status_changed', tenantId, sourceSystem: 'ecommerce',
      entityType: 'return_request', entityId: returnId,
      payload: record, occurredAt: now,
    });
    return { id: returnId, status: 'requested' };
  }

  // ─── Private helpers ───────────────────────────────────────────────────────

  private async _requireCart(tenantId: string, cartId: string): Promise<Cart> {
    const cart = await this.getCart(tenantId, cartId);
    if (!cart) throw new Error(`Cart ${cartId} not found`);
    return cart;
  }

  private _recalcTotals(cart: Cart): Cart {
    cart.subtotal = cart.lineItems.reduce((sum, l) => sum + l.total, 0);
    cart.discountTotal = cart.discounts.reduce((sum, d) => {
      if (d.rule.type === 'percentage') return sum + Math.round(cart.subtotal * d.rule.value / 100);
      if (d.rule.type === 'fixed') return sum + d.rule.value;
      return sum; // free_shipping handled separately
    }, 0);
    cart.total = Math.max(0, cart.subtotal - cart.discountTotal + cart.shippingTotal + cart.taxTotal);
    return cart;
  }

  private async _saveCart(tenantId: string, cart: Cart): Promise<Cart> {
    cart.updatedAt = new Date();
    const updated = this._recalcTotals(cart);
    await this._persistCart(tenantId, updated);
    return updated;
  }

  private async _persistCart(tenantId: string, cart: Cart): Promise<void> {
    const now = new Date();
    await this.store.upsert({
      snapshotId: ulid(), tenantId,
      entityType: 'cart', canonicalId: cart.id,
      externalIds: [{ system: 'ecommerce', id: cart.id }],
      payloadHash: hashPayload(cart as unknown as Record<string, unknown>),
      payload: cart as unknown as Record<string, unknown>,
      sourceSystem: this.medusa ? 'medusa' : 'ecommerce',
      updatedAtSource: now, updatedAtSnapshot: now,
    });
  }

  private async _resolveVariant(tenantId: string, variantId: string): Promise<Variant | null> {
    const snaps = await this.store.list(tenantId, 'catalog_item');
    for (const snap of snaps) {
      const item = snap.payload as unknown as CatalogItem;
      const v = item.variants?.find(v => v.id === variantId);
      if (v) return v;
    }
    return null;
  }

  private async _resolveVariantPrice(tenantId: string, variantId: string, currency: string): Promise<number> {
    const variant = await this._resolveVariant(tenantId, variantId);
    if (!variant) return 0;
    const prices = variant.prices ?? [];
    const price = prices.find(p => p.currency === currency) ?? prices[0];
    return price?.amount ?? 0;
  }

  private async _syncEntry(tenantId: string, entityType: string, now: Date): Promise<void> {
    await this.timeline?.append(tenantId, {
      kind: 'sync', tenantId, occurredAt: now, entityType,
      sourceSystem: 'ecommerce', trigger: 'manual',
      recordsFetched: 1, recordsChanged: 1,
      cursor: null, cursorAfter: null, durationMs: 0,
    });
  }
}
