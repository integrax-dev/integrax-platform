/**
 * Medusa adapter boundary tests
 *
 * Key invariants:
 *   1. Adapter uses HTTP-only (fetch) — no SDK import
 *   2. createMedusaAdapter returns null when config is missing
 *   3. Admin endpoints carry Authorization header
 *   4. Store endpoints carry publishable-api-key (not admin key)
 *   5. Tenant header is forwarded when tenantId is set
 *   6. 404 from Medusa is translated to null (not thrown)
 *   7. Non-404 errors are thrown
 *   8. Product mapping: MedusaProduct → CatalogItem round-trip
 *   9. Cart mapping: MedusaCart → Cart
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MedusaAdapter, createMedusaAdapter } from '../medusa-adapter/adapter.js';
import type { MedusaProduct, MedusaCart } from '../medusa-adapter/types.js';

const BASE_URL = 'http://medusa.test';

const CONFIG = {
  medusaBaseUrl: BASE_URL,
  medusaAdminApiKey: 'admin-key-123',
  tenantId: 'tenant-xyz',
};

// ─── Fixture helpers ──────────────────────────────────────────────────────────

function makeMedusaProduct(overrides: Partial<MedusaProduct> = {}): MedusaProduct {
  return {
    id: 'prod_abc',
    title: 'Test Product',
    description: 'A test product',
    status: 'published',
    handle: 'test-product',
    variants: [
      {
        id: 'var_1',
        product_id: 'prod_abc',
        title: 'Default Variant',
        sku: 'SKU-001',
        prices: [{ id: 'price_1', variant_id: 'var_1', currency_code: 'ars', amount: 10000 }],
        inventory_quantity: 50,
        allow_backorder: false,
      },
    ],
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-02T00:00:00Z',
    ...overrides,
  };
}

function makeMedusaCart(overrides: Partial<MedusaCart> = {}): MedusaCart {
  return {
    id: 'cart_123',
    currency_code: 'ars',
    region_id: 'reg_1',
    items: [],
    total: 0,
    subtotal: 0,
    discount_total: 0,
    tax_total: 0,
    shipping_total: 0,
    discounts: [],
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

function mockFetch(body: unknown, status = 200) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response);
}

// ─── createMedusaAdapter factory ─────────────────────────────────────────────

describe('createMedusaAdapter', () => {
  it('returns null when config is null', () => {
    expect(createMedusaAdapter(null)).toBeNull();
  });

  it('returns null when medusaBaseUrl is empty', () => {
    expect(createMedusaAdapter({ medusaBaseUrl: '', medusaAdminApiKey: 'key' })).toBeNull();
  });

  it('returns null when medusaAdminApiKey is empty', () => {
    expect(createMedusaAdapter({ medusaBaseUrl: BASE_URL, medusaAdminApiKey: '' })).toBeNull();
  });

  it('returns a MedusaAdapter instance when config is valid', () => {
    const adapter = createMedusaAdapter(CONFIG);
    expect(adapter).toBeInstanceOf(MedusaAdapter);
  });
});

// ─── Admin headers ────────────────────────────────────────────────────────────

describe('MedusaAdapter — admin headers', () => {
  let adapter: MedusaAdapter;

  beforeEach(() => { adapter = new MedusaAdapter(CONFIG); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('listProducts sends Authorization header with admin key', async () => {
    const spy = mockFetch({ products: [makeMedusaProduct()] });
    await adapter.listProducts();
    const headers = spy.mock.calls[0][1]?.headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer admin-key-123');
  });

  it('listProducts sends x-medusa-tenant-id when tenantId is set', async () => {
    const spy = mockFetch({ products: [] });
    await adapter.listProducts();
    const headers = spy.mock.calls[0][1]?.headers as Record<string, string>;
    expect(headers['x-medusa-tenant-id']).toBe('tenant-xyz');
  });

  it('omits x-medusa-tenant-id when tenantId is not in config', async () => {
    const adapterNoTenant = new MedusaAdapter({ medusaBaseUrl: BASE_URL, medusaAdminApiKey: 'key' });
    const spy = mockFetch({ products: [] });
    await adapterNoTenant.listProducts();
    const headers = spy.mock.calls[0][1]?.headers as Record<string, string>;
    expect(headers['x-medusa-tenant-id']).toBeUndefined();
  });
});

// ─── URL routing ──────────────────────────────────────────────────────────────

describe('MedusaAdapter — URL routing', () => {
  let adapter: MedusaAdapter;

  beforeEach(() => { adapter = new MedusaAdapter(CONFIG); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('admin endpoints use /admin prefix', async () => {
    const spy = mockFetch({ products: [] });
    await adapter.listProducts();
    expect(String(spy.mock.calls[0][0])).toContain('/admin/products');
  });

  it('store endpoints (getCart) use /store prefix', async () => {
    const spy = mockFetch({ cart: makeMedusaCart() });
    await adapter.getCart('cart_123');
    expect(String(spy.mock.calls[0][0])).toContain('/store/carts');
  });

  it('createCart sends POST to /store/carts', async () => {
    const spy = mockFetch({ cart: makeMedusaCart() });
    await adapter.createCart({ currency: 'ars' });
    const call = spy.mock.calls[0];
    expect(String(call[0])).toContain('/store/carts');
    expect(call[1]?.method).toBe('POST');
  });
});

// ─── 404 → null ───────────────────────────────────────────────────────────────

describe('MedusaAdapter — 404 handling', () => {
  let adapter: MedusaAdapter;

  beforeEach(() => { adapter = new MedusaAdapter(CONFIG); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('getProduct returns null on 404', async () => {
    mockFetch({ message: 'Product not found' }, 404);
    const result = await adapter.getProduct('nonexistent');
    expect(result).toBeNull();
  });

  it('getCart returns null on 404', async () => {
    mockFetch({ message: 'Cart not found' }, 404);
    const result = await adapter.getCart('nonexistent');
    expect(result).toBeNull();
  });

  it('non-404 errors are rethrown', async () => {
    mockFetch({ message: 'Internal server error' }, 500);
    await expect(adapter.getProduct('prod_1')).rejects.toThrow('500');
  });
});

// ─── Product mapping ──────────────────────────────────────────────────────────

describe('MedusaAdapter — product mapping', () => {
  let adapter: MedusaAdapter;

  beforeEach(() => { adapter = new MedusaAdapter(CONFIG); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('maps Medusa product fields to CatalogItem', async () => {
    const mp = makeMedusaProduct({ id: 'prod_z', title: 'Widget', status: 'published' });
    mockFetch({ products: [mp] });
    const items = await adapter.listProducts();
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe('Widget');
    expect(items[0].status).toBe('published');
  });

  it('maps variants and price', async () => {
    const mp = makeMedusaProduct();
    mockFetch({ product: mp });
    const item = await adapter.getProduct('prod_abc');
    expect(item).not.toBeNull();
    expect(item!.variants).toHaveLength(1);
    expect(item!.variants[0].sku).toBe('SKU-001');
  });

  it('includes externalIds with system=medusa', async () => {
    const mp = makeMedusaProduct({ id: 'prod_ext' });
    mockFetch({ product: mp });
    const item = await adapter.getProduct('prod_ext');
    const medusaId = item!.externalIds.find(e => e.system === 'medusa');
    expect(medusaId).toBeDefined();
    expect(medusaId!.id).toBe('prod_ext');
  });
});

// ─── Cart mapping ─────────────────────────────────────────────────────────────

describe('MedusaAdapter — cart mapping', () => {
  let adapter: MedusaAdapter;

  beforeEach(() => { adapter = new MedusaAdapter(CONFIG); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('maps Medusa cart to Cart with id and currency', async () => {
    const mc = makeMedusaCart({ id: 'cart_mapped', currency_code: 'usd', total: 5000 });
    mockFetch({ cart: mc });
    const cart = await adapter.getCart('cart_mapped');
    expect(cart).not.toBeNull();
    expect(cart!.id).toBe('cart_mapped');
    expect(cart!.currency).toBe('usd');
  });

  it('addLineItem sends variant_id and quantity', async () => {
    const spy = mockFetch({ cart: makeMedusaCart({ id: 'cart_li' }) });
    await adapter.addLineItem('cart_li', 'var_99', 3);
    const body = JSON.parse(spy.mock.calls[0][1]?.body as string);
    expect(body.variant_id).toBe('var_99');
    expect(body.quantity).toBe(3);
  });
});
