/**
 * EcommerceService tests
 *
 * Verifies:
 *   1. Without Medusa — falls back to snapshot-store for reads
 *   2. ingestCatalogItem persists to snapshot-store AND publishes event
 *   3. Medusa-required operations throw when adapter is null
 *   4. startCheckout publishes order.created event
 *   5. requestFulfillment publishes shipment.created event
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { InMemorySnapshotStore } from '@integrax/snapshot-store';
import { InMemoryEventBus } from '@integrax/event-bus';
import { EcommerceService } from '../ecommerce-service.js';
import type { CatalogItem, Cart } from '../types.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeCatalogItem(overrides: Partial<CatalogItem> = {}): CatalogItem {
  return {
    id: 'item-001',
    tenantId: 'T1',
    externalIds: [{ system: 'shopify', id: 'ext-001' }],
    title: 'Test Widget',
    description: 'A widget',
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

function makeCart(overrides: Partial<Cart> = {}): Cart {
  return {
    id: 'cart-001',
    tenantId: 'T1',
    currency: 'ARS',
    lineItems: [],
    total: 0,
    subtotal: 0,
    discountTotal: 0,
    taxTotal: 0,
    shippingTotal: 0,
    discounts: [],
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...overrides,
  };
}

function makeService(medusa: unknown = null) {
  const store = new InMemorySnapshotStore();
  const bus = new InMemoryEventBus();
  const service = new EcommerceService(store, bus, undefined, medusa as never);
  return { store, bus, service };
}

// ─── No-Medusa fallback reads ─────────────────────────────────────────────────

describe('EcommerceService — snapshot-store fallback (no Medusa)', () => {
  it('listCatalogItems returns items from snapshot-store when Medusa is absent', async () => {
    const { store, service } = makeService();

    // Pre-populate snapshot store directly
    await store.upsert({
      snapshotId: 'snap1',
      tenantId: 'T1',
      entityType: 'catalog_item',
      canonicalId: 'item-001',
      externalIds: [],
      payloadHash: 'abc',
      payload: makeCatalogItem() as unknown as Record<string, unknown>,
      sourceSystem: 'test',
      updatedAtSource: new Date(),
      updatedAtSnapshot: new Date(),
    });

    const items = await service.listCatalogItems('T1');
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe('Test Widget');
  });

  it('getCatalogItem returns null for unknown id', async () => {
    const { service } = makeService();
    const result = await service.getCatalogItem('T1', 'nonexistent');
    expect(result).toBeNull();
  });

  it('getCart returns null when no snapshot exists', async () => {
    const { service } = makeService();
    const result = await service.getCart('T1', 'cart-not-found');
    expect(result).toBeNull();
  });

  it('getCart returns cart from snapshot-store', async () => {
    const { store, service } = makeService();
    const cart = makeCart({ id: 'cart-snap' });

    await store.upsert({
      snapshotId: 'snap2',
      tenantId: 'T1',
      entityType: 'cart',
      canonicalId: 'cart-snap',
      externalIds: [],
      payloadHash: 'xyz',
      payload: cart as unknown as Record<string, unknown>,
      sourceSystem: 'test',
      updatedAtSource: new Date(),
      updatedAtSnapshot: new Date(),
    });

    const result = await service.getCart('T1', 'cart-snap');
    expect(result).not.toBeNull();
    expect(result!.id).toBe('cart-snap');
  });
});

// ─── ingestCatalogItem ────────────────────────────────────────────────────────

describe('EcommerceService.ingestCatalogItem', () => {
  it('persists item to snapshot-store with entityType=catalog_item', async () => {
    const { store, service } = makeService();
    const item = makeCatalogItem({ id: 'item-ingested' });

    await service.ingestCatalogItem('T1', item);

    const snap = await store.get('T1', 'catalog_item', 'item-ingested');
    expect(snap).not.toBeNull();
    expect(snap!.payload['title']).toBe('Test Widget');
  });

  it('publishes a product.updated event to the event bus', async () => {
    const { bus, service } = makeService();
    const received: unknown[] = [];
    bus.subscribe('product.updated', e => { received.push(e); return Promise.resolve(); });

    await service.ingestCatalogItem('T1', makeCatalogItem({ id: 'item-event' }));

    expect(received).toHaveLength(1);
    const evt = received[0] as { type: string; tenantId: string; entityId: string };
    expect(evt.type).toBe('product.updated');
    expect(evt.tenantId).toBe('T1');
    expect(evt.entityId).toBe('item-event');
  });

  it('returns the ingested item unchanged', async () => {
    const { service } = makeService();
    const item = makeCatalogItem();
    const result = await service.ingestCatalogItem('T1', item);
    expect(result).toBe(item);
  });
});

// ─── Medusa-required operations ───────────────────────────────────────────────

describe('EcommerceService — Medusa-required operations', () => {
  it('createCart throws when Medusa is not configured', async () => {
    const { service } = makeService(null);
    await expect(service.createCart('T1')).rejects.toThrow('Medusa');
  });

  it('addLineItem throws when Medusa is not configured', async () => {
    const { service } = makeService(null);
    await expect(service.addLineItem('T1', 'cart-x', 'var-x', 1)).rejects.toThrow('Medusa');
  });

  it('removeLineItem throws when Medusa is not configured', async () => {
    const { service } = makeService(null);
    await expect(service.removeLineItem('T1', 'cart-x', 'line-x')).rejects.toThrow('Medusa');
  });

  it('applyPromotion throws when Medusa is not configured', async () => {
    const { service } = makeService(null);
    await expect(service.applyPromotion('T1', 'cart-x', 'PROMO10')).rejects.toThrow('Medusa');
  });
});

// ─── startCheckout ────────────────────────────────────────────────────────────

describe('EcommerceService.startCheckout', () => {
  it('throws if cart does not exist in snapshot-store', async () => {
    const { service } = makeService();
    await expect(service.startCheckout('T1', 'nonexistent-cart')).rejects.toThrow('not found');
  });

  it('publishes order.created event and returns checkout session', async () => {
    const { store, bus, service } = makeService();
    const cart = makeCart({ id: 'cart-checkout' });

    // Seed cart into snapshot-store
    await store.upsert({
      snapshotId: 'snap3',
      tenantId: 'T1',
      entityType: 'cart',
      canonicalId: 'cart-checkout',
      externalIds: [],
      payloadHash: 'p1',
      payload: cart as unknown as Record<string, unknown>,
      sourceSystem: 'test',
      updatedAtSource: new Date(),
      updatedAtSnapshot: new Date(),
    });

    const received: unknown[] = [];
    bus.subscribe('order.created', e => { received.push(e); return Promise.resolve(); });

    const session = await service.startCheckout('T1', 'cart-checkout');

    expect(session.cartId).toBe('cart-checkout');
    expect(session.status).toBe('payment_required');
    expect(received).toHaveLength(1);
    const evt = received[0] as { type: string };
    expect(evt.type).toBe('order.created');
  });
});

// ─── requestFulfillment ───────────────────────────────────────────────────────

describe('EcommerceService.requestFulfillment', () => {
  it('publishes shipment.created event', async () => {
    const { bus, service } = makeService();
    const received: unknown[] = [];
    bus.subscribe('shipment.created', e => { received.push(e); return Promise.resolve(); });

    await service.requestFulfillment('T1', {
      orderId: 'order-xyz',
      tenantId: 'T1',
      items: [{ variantId: 'var-1', quantity: 2 }],
    });

    expect(received).toHaveLength(1);
    const evt = received[0] as { type: string; entityId: string };
    expect(evt.type).toBe('shipment.created');
    expect(evt.entityId).toBe('order-xyz');
  });
});
