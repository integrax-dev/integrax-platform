/**
 * EcommerceService tests
 *
 * All operations run natively (no Medusa). Uses local Map-backed test doubles
 * instead of InMemorySnapshotStore / InMemoryEventBus.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EntitySnapshot } from '@integrax/snapshot-store';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('@integrax/snapshot-store', () => ({
  hashPayload: (p: unknown) => JSON.stringify(p),
  SnapshotStore: class {},
}));

vi.mock('@integrax/event-bus', () => ({
  EventBus: class {},
}));

import { EcommerceService } from '../ecommerce-service.js';
import type { CatalogItem, Discount } from '../types.js';

// ── Local test doubles ────────────────────────────────────────────────────────

function makeStore() {
  const map = new Map<string, EntitySnapshot>();
  return {
    async get(tenantId: string, entityType: string, canonicalId: string): Promise<EntitySnapshot | null> {
      return map.get(`${tenantId}:${entityType}:${canonicalId}`) ?? null;
    },
    async upsert(snap: EntitySnapshot): Promise<void> {
      map.set(`${snap.tenantId}:${snap.entityType}:${snap.canonicalId}`, snap);
    },
    async list(tenantId: string, entityType: string): Promise<EntitySnapshot[]> {
      return [...map.values()].filter(s => s.tenantId === tenantId && s.entityType === entityType);
    },
    async getAll(tenantId: string): Promise<EntitySnapshot[]> {
      return [...map.values()].filter(s => s.tenantId === tenantId);
    },
    async diff(_a: EntitySnapshot, _b: EntitySnapshot) {
      return { conflicts: [], hasConflicts: false, worstSeverity: null };
    },
  };
}

function makeBus() {
  const handlers = new Map<string, ((e: unknown) => Promise<void>)[]>();
  return {
    async publish(event: unknown): Promise<void> {
      const type = (event as { type: string }).type;
      for (const h of handlers.get(type) ?? []) await h(event);
    },
    subscribe(type: string, handler: (e: unknown) => Promise<void>) {
      if (!handlers.has(type)) handlers.set(type, []);
      handlers.get(type)!.push(handler);
      return () => {};
    },
    subscribeAll: vi.fn(),
    deadLetterQueue: vi.fn(),
    replayDlq: vi.fn(),
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeCatalogItem(overrides: Partial<CatalogItem> = {}): CatalogItem {
  return {
    id: 'item-001',
    tenantId: 'T1',
    externalIds: [{ system: 'shopify', id: 'ext-001' }],
    title: 'Test Widget',
    handle: 'test-widget',
    status: 'published',
    variants: [{
      id: 'var-001',
      catalogItemId: 'item-001',
      title: 'Default',
      sku: 'SKU-001',
      prices: [{ id: 'price-001', variantId: 'var-001', currency: 'ARS', amount: 1000 }],
    }],
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...overrides,
  };
}

function makeService() {
  const store = makeStore();
  const bus   = makeBus();
  const service = new EcommerceService(store as never, bus as never, undefined, null);
  return { store, bus, service };
}

async function seedItem(
  store: ReturnType<typeof makeStore>,
  item: CatalogItem,
) {
  const now = new Date();
  await store.upsert({
    snapshotId: `snap-${item.id}`, tenantId: item.tenantId,
    entityType: 'catalog_item', canonicalId: item.id,
    externalIds: item.externalIds,
    payloadHash: item.id,
    payload: item as unknown as Record<string, unknown>,
    sourceSystem: 'test',
    updatedAtSource: now, updatedAtSnapshot: now,
  });
}

// ── Catalog ───────────────────────────────────────────────────────────────────

describe('Catalog', () => {
  beforeEach(() => vi.clearAllMocks());

  it('listCatalogItems returns items from snapshot-store', async () => {
    const { store, service } = makeService();
    await seedItem(store, makeCatalogItem());
    const items = await service.listCatalogItems('T1');
    expect(items).toHaveLength(1);
    expect(items[0]!.title).toBe('Test Widget');
  });

  it('listCatalogItems filters by status', async () => {
    const { store, service } = makeService();
    await seedItem(store, makeCatalogItem({ id: 'a', status: 'published' }));
    await seedItem(store, makeCatalogItem({ id: 'b', status: 'draft' }));
    const published = await service.listCatalogItems('T1', { status: 'published' });
    expect(published).toHaveLength(1);
    expect(published[0]!.id).toBe('a');
  });

  it('getCatalogItem returns null for unknown id', async () => {
    const { service } = makeService();
    expect(await service.getCatalogItem('T1', 'nonexistent')).toBeNull();
  });

  it('ingestCatalogItem persists and returns item', async () => {
    const { store, service } = makeService();
    const item = makeCatalogItem({ id: 'ingested' });
    const result = await service.ingestCatalogItem('T1', item);
    expect(result.id).toBe('ingested');
    const snap = await store.get('T1', 'catalog_item', 'ingested');
    expect(snap).not.toBeNull();
  });

  it('ingestCatalogItem publishes product.updated event', async () => {
    const { bus, service } = makeService();
    const received: unknown[] = [];
    bus.subscribe('product.updated', async e => { received.push(e); });
    await service.ingestCatalogItem('T1', makeCatalogItem({ id: 'evt-item' }));
    expect(received).toHaveLength(1);
    const evt = received[0] as { type: string; entityId: string };
    expect(evt.type).toBe('product.updated');
    expect(evt.entityId).toBe('evt-item');
  });

  it('updateCatalogItemStatus changes status', async () => {
    const { store, service } = makeService();
    await seedItem(store, makeCatalogItem({ id: 'upd', status: 'draft' }));
    const updated = await service.updateCatalogItemStatus('T1', 'upd', 'published');
    expect(updated.status).toBe('published');
  });
});

// ── Carts (native) ────────────────────────────────────────────────────────────

describe('Carts — native (no Medusa)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('createCart returns a cart with correct defaults', async () => {
    const { service } = makeService();
    const cart = await service.createCart('T1', { currency: 'USD' });
    expect(cart.id).toMatch(/^cart_/);
    expect(cart.currency).toBe('USD');
    expect(cart.lineItems).toHaveLength(0);
    expect(cart.total).toBe(0);
  });

  it('createCart defaults to ARS when no currency given', async () => {
    const { service } = makeService();
    const cart = await service.createCart('T1');
    expect(cart.currency).toBe('ARS');
  });

  it('getCart returns null for unknown cart', async () => {
    const { service } = makeService();
    expect(await service.getCart('T1', 'unknown')).toBeNull();
  });

  it('getCart returns persisted cart', async () => {
    const { service } = makeService();
    const created = await service.createCart('T1');
    const fetched = await service.getCart('T1', created.id);
    expect(fetched).not.toBeNull();
    expect(fetched!.id).toBe(created.id);
  });

  it('addLineItem adds item with correct price and total', async () => {
    const { store, service } = makeService();
    await seedItem(store, makeCatalogItem());
    const cart = await service.createCart('T1', { currency: 'ARS' });
    const updated = await service.addLineItem('T1', cart.id, 'var-001', 2);
    expect(updated.lineItems).toHaveLength(1);
    expect(updated.lineItems[0]!.quantity).toBe(2);
    expect(updated.lineItems[0]!.unitPrice).toBe(1000);
    expect(updated.lineItems[0]!.total).toBe(2000);
    expect(updated.subtotal).toBe(2000);
    expect(updated.total).toBe(2000);
  });

  it('addLineItem accumulates quantity for same variant', async () => {
    const { store, service } = makeService();
    await seedItem(store, makeCatalogItem());
    const cart = await service.createCart('T1', { currency: 'ARS' });
    await service.addLineItem('T1', cart.id, 'var-001', 1);
    const updated = await service.addLineItem('T1', cart.id, 'var-001', 3);
    expect(updated.lineItems).toHaveLength(1);
    expect(updated.lineItems[0]!.quantity).toBe(4);
    expect(updated.total).toBe(4000);
  });

  it('updateLineItemQuantity updates quantity and total', async () => {
    const { store, service } = makeService();
    await seedItem(store, makeCatalogItem());
    const cart = await service.createCart('T1', { currency: 'ARS' });
    const withItem = await service.addLineItem('T1', cart.id, 'var-001', 5);
    const lineItemId = withItem.lineItems[0]!.id;
    const updated = await service.updateLineItemQuantity('T1', cart.id, lineItemId, 2);
    expect(updated.lineItems[0]!.quantity).toBe(2);
    expect(updated.total).toBe(2000);
  });

  it('updateLineItemQuantity with 0 removes the line item', async () => {
    const { store, service } = makeService();
    await seedItem(store, makeCatalogItem());
    const cart = await service.createCart('T1', { currency: 'ARS' });
    const withItem = await service.addLineItem('T1', cart.id, 'var-001', 2);
    const lineItemId = withItem.lineItems[0]!.id;
    const updated = await service.updateLineItemQuantity('T1', cart.id, lineItemId, 0);
    expect(updated.lineItems).toHaveLength(0);
    expect(updated.total).toBe(0);
  });

  it('removeLineItem removes item from cart', async () => {
    const { store, service } = makeService();
    await seedItem(store, makeCatalogItem());
    const cart = await service.createCart('T1', { currency: 'ARS' });
    const withItem = await service.addLineItem('T1', cart.id, 'var-001', 1);
    const lineItemId = withItem.lineItems[0]!.id;
    const updated = await service.removeLineItem('T1', cart.id, lineItemId);
    expect(updated.lineItems).toHaveLength(0);
  });

  it('setShippingAddress persists address on cart', async () => {
    const { service } = makeService();
    const cart = await service.createCart('T1');
    const updated = await service.setShippingAddress('T1', cart.id, {
      address1: 'Av. Corrientes 1234', city: 'Buenos Aires', countryCode: 'AR',
    });
    expect(updated.shippingAddress?.address1).toBe('Av. Corrientes 1234');
  });
});

// ── Discounts / Promotions ────────────────────────────────────────────────────

describe('Discounts', () => {
  beforeEach(() => vi.clearAllMocks());

  function makeDiscount(overrides: Partial<Omit<Discount, 'id' | 'usageCount'>> = {}): Omit<Discount, 'id' | 'usageCount'> {
    return {
      code: 'SAVE10',
      rule: { id: 'rule-1', type: 'percentage', value: 10 },
      isDisabled: false,
      ...overrides,
    };
  }

  it('createDiscount assigns an id and usageCount=0', async () => {
    const { service } = makeService();
    const discount = await service.createDiscount('T1', makeDiscount());
    expect(discount.id).toMatch(/^disc_/);
    expect(discount.usageCount).toBe(0);
    expect(discount.code).toBe('SAVE10');
  });

  it('getDiscount returns null for unknown code', async () => {
    const { service } = makeService();
    expect(await service.getDiscount('T1', 'NOPE')).toBeNull();
  });

  it('listDiscounts returns all created discounts', async () => {
    const { service } = makeService();
    await service.createDiscount('T1', makeDiscount({ code: 'A10' }));
    await service.createDiscount('T1', makeDiscount({ code: 'B20' }));
    const list = await service.listDiscounts('T1');
    expect(list).toHaveLength(2);
  });

  it('applyPromotion throws for unknown discount code', async () => {
    const { service } = makeService();
    const cart = await service.createCart('T1');
    await expect(service.applyPromotion('T1', cart.id, 'GHOST')).rejects.toThrow('not found');
  });

  it('applyPromotion throws for disabled discount', async () => {
    const { service } = makeService();
    await service.createDiscount('T1', makeDiscount({ code: 'OFF', isDisabled: true }));
    const cart = await service.createCart('T1');
    await expect(service.applyPromotion('T1', cart.id, 'OFF')).rejects.toThrow('disabled');
  });

  it('applyPromotion (percentage) reduces cart total correctly', async () => {
    const { store, service } = makeService();
    await seedItem(store, makeCatalogItem());
    await service.createDiscount('T1', makeDiscount({ code: 'SAVE10' }));
    const cart = await service.createCart('T1', { currency: 'ARS' });
    await service.addLineItem('T1', cart.id, 'var-001', 2);
    const updated = await service.applyPromotion('T1', cart.id, 'SAVE10');
    expect(updated.discountTotal).toBe(200);
    expect(updated.total).toBe(1800);
  });

  it('applyPromotion (fixed) reduces cart total by fixed amount', async () => {
    const { store, service } = makeService();
    await seedItem(store, makeCatalogItem());
    await service.createDiscount('T1', {
      code: 'FIXED500',
      rule: { id: 'r2', type: 'fixed', value: 500 },
      isDisabled: false,
    });
    const cart = await service.createCart('T1', { currency: 'ARS' });
    await service.addLineItem('T1', cart.id, 'var-001', 1);
    const updated = await service.applyPromotion('T1', cart.id, 'FIXED500');
    expect(updated.discountTotal).toBe(500);
    expect(updated.total).toBe(500);
  });

  it('applyPromotion is idempotent — same code applied twice stays once', async () => {
    const { service } = makeService();
    await service.createDiscount('T1', makeDiscount({ code: 'ONCE' }));
    const cart = await service.createCart('T1');
    await service.applyPromotion('T1', cart.id, 'ONCE');
    const updated = await service.applyPromotion('T1', cart.id, 'ONCE');
    expect(updated.discounts).toHaveLength(1);
  });

  it('removePromotion removes discount from cart', async () => {
    const { service } = makeService();
    await service.createDiscount('T1', makeDiscount({ code: 'REM' }));
    const cart = await service.createCart('T1');
    await service.applyPromotion('T1', cart.id, 'REM');
    const updated = await service.removePromotion('T1', cart.id, 'REM');
    expect(updated.discounts).toHaveLength(0);
  });
});

// ── Checkout ──────────────────────────────────────────────────────────────────

describe('Checkout', () => {
  beforeEach(() => vi.clearAllMocks());

  it('startCheckout throws if cart does not exist', async () => {
    const { service } = makeService();
    await expect(service.startCheckout('T1', 'ghost-cart')).rejects.toThrow('not found');
  });

  it('startCheckout returns session with payment_required status', async () => {
    const { service } = makeService();
    const cart = await service.createCart('T1');
    const session = await service.startCheckout('T1', cart.id);
    expect(session.id).toMatch(/^cs_/);
    expect(session.cartId).toBe(cart.id);
    expect(session.status).toBe('payment_required');
  });

  it('startCheckout publishes order.created event', async () => {
    const { bus, service } = makeService();
    const cart = await service.createCart('T1');
    const received: unknown[] = [];
    bus.subscribe('order.created', async e => { received.push(e); });
    await service.startCheckout('T1', cart.id);
    expect(received).toHaveLength(1);
    expect((received[0] as { type: string }).type).toBe('order.created');
  });
});

// ── Customers ─────────────────────────────────────────────────────────────────

describe('Customer accounts', () => {
  beforeEach(() => vi.clearAllMocks());

  it('createCustomerAccount assigns id and publishes customer.created', async () => {
    const { bus, service } = makeService();
    const received: unknown[] = [];
    bus.subscribe('customer.created', async e => { received.push(e); });
    const account = await service.createCustomerAccount('T1', {
      tenantId: 'T1', email: 'lautaro@test.com', hasAccount: true,
    });
    expect(account.id).toMatch(/^cust_/);
    expect(account.email).toBe('lautaro@test.com');
    expect(received).toHaveLength(1);
  });

  it('getCustomerAccount returns null for unknown id', async () => {
    const { service } = makeService();
    expect(await service.getCustomerAccount('T1', 'nope')).toBeNull();
  });

  it('getCustomerByEmail finds account by email', async () => {
    const { service } = makeService();
    await service.createCustomerAccount('T1', { tenantId: 'T1', email: 'find@me.com', hasAccount: true });
    const found = await service.getCustomerByEmail('T1', 'find@me.com');
    expect(found).not.toBeNull();
    expect(found!.email).toBe('find@me.com');
  });

  it('updateCustomerAccount patches fields', async () => {
    const { service } = makeService();
    const account = await service.createCustomerAccount('T1', {
      tenantId: 'T1', email: 'upd@test.com', hasAccount: false,
    });
    const updated = await service.updateCustomerAccount('T1', account.id, { firstName: 'Lautaro' });
    expect(updated.firstName).toBe('Lautaro');
    expect(updated.email).toBe('upd@test.com');
  });
});

// ── Draft Orders ──────────────────────────────────────────────────────────────

describe('Draft Orders', () => {
  beforeEach(() => vi.clearAllMocks());

  it('createDraftOrder persists and returns order with status=open', async () => {
    const { service } = makeService();
    const order = await service.createDraftOrder('T1', {
      currency: 'ARS', total: 5000, lineItems: [],
    });
    expect(order.id).toMatch(/^ord_/);
    expect(order.status).toBe('open');
    expect(order.total).toBe(5000);
  });

  it('getDraftOrder returns null for unknown id', async () => {
    const { service } = makeService();
    expect(await service.getDraftOrder('T1', 'ghost')).toBeNull();
  });

  it('listDraftOrders returns orders filtered by status', async () => {
    const { service } = makeService();
    await service.createDraftOrder('T1', { currency: 'ARS', total: 100, lineItems: [] });
    const open = await service.listDraftOrders('T1', { status: 'open' });
    expect(open).toHaveLength(1);
    const canceled = await service.listDraftOrders('T1', { status: 'canceled' });
    expect(canceled).toHaveLength(0);
  });

  it('cancelDraftOrder transitions to canceled and emits event', async () => {
    const { bus, service } = makeService();
    const received: unknown[] = [];
    bus.subscribe('order.status_changed', async e => { received.push(e); });
    const order = await service.createDraftOrder('T1', { currency: 'ARS', total: 0, lineItems: [] });
    const canceled = await service.cancelDraftOrder('T1', order.id);
    expect(canceled.status).toBe('canceled');
    expect(received).toHaveLength(1);
  });

  it('cancelDraftOrder throws for already completed orders', async () => {
    const { store, service } = makeService();
    const now = new Date();
    await store.upsert({
      snapshotId: 'sn', tenantId: 'T1', entityType: 'draft_order', canonicalId: 'ord-done',
      externalIds: [], payloadHash: 'h',
      payload: { id: 'ord-done', status: 'completed', tenantId: 'T1', currency: 'ARS', total: 0, lineItems: [], createdAt: now } as unknown as Record<string, unknown>,
      sourceSystem: 'ecommerce', updatedAtSource: now, updatedAtSnapshot: now,
    });
    await expect(service.cancelDraftOrder('T1', 'ord-done')).rejects.toThrow('already completed');
  });
});

// ── Fulfillment & Returns ─────────────────────────────────────────────────────

describe('Fulfillment & Returns', () => {
  beforeEach(() => vi.clearAllMocks());

  it('requestFulfillment publishes shipment.created event', async () => {
    const { bus, service } = makeService();
    const received: unknown[] = [];
    bus.subscribe('shipment.created', async e => { received.push(e); });
    await service.requestFulfillment('T1', {
      orderId: 'ord-xyz', tenantId: 'T1',
      items: [{ variantId: 'var-1', quantity: 2 }],
    });
    expect(received).toHaveLength(1);
    expect((received[0] as { entityId: string }).entityId).toBe('ord-xyz');
  });

  it('requestReturn persists return and publishes shipment.status_changed', async () => {
    const { bus, service } = makeService();
    const received: unknown[] = [];
    bus.subscribe('shipment.status_changed', async e => { received.push(e); });
    const result = await service.requestReturn('T1', {
      orderId: 'ord-abc', tenantId: 'T1',
      items: [{ lineItemId: 'li-1', quantity: 1, reason: 'defective' }],
    });
    expect(result.id).toMatch(/^ret_/);
    expect(result.status).toBe('requested');
    expect(received).toHaveLength(1);
  });
});
