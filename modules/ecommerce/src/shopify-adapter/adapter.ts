/**
 * Shopify Adapter
 *
 * Global #1 ecommerce platform. Uses Admin API 2024-01 (REST).
 * GraphQL Storefront API is not used here — Admin REST covers all catalog + order operations.
 *
 * Auth: X-Shopify-Access-Token header (private app token or OAuth).
 * Shopify exposes draft orders for headless checkout; we wire that as createCart/completeCart.
 */

import type { EcommerceAdapter } from '../adapter.js';
import type { CatalogItem, Variant, Price, Cart, LineItem } from '../types.js';
import { ulid } from '@integrax/entities';

export interface ShopifyAdapterConfig {
  shopDomain: string;       // e.g. mystore.myshopify.com
  accessToken: string;
  apiVersion?: string;      // default: 2024-01
  tenantId?: string;
}

interface ShopifyVariant {
  id: number;
  sku: string;
  price: string;
  inventory_quantity: number;
  title: string;
  fulfillment_service: string;
  inventory_management: string | null;
}

interface ShopifyProduct {
  id: number;
  title: string;
  body_html: string;
  handle: string;
  status: 'active' | 'archived' | 'draft';
  variants: ShopifyVariant[];
  tags: string;
  created_at: string;
  updated_at: string;
}

interface ShopifyDraftOrder {
  id: number;
  status: string;
  line_items: Array<{
    id: number;
    variant_id: number | null;
    title: string;
    quantity: number;
    price: string;
  }>;
  currency: string;
  total_price: string;
  subtotal_price: string;
  shipping_address: unknown;
  billing_address: unknown;
  created_at: string;
  updated_at: string;
}

const STATUS_MAP: Record<string, CatalogItem['status']> = {
  active: 'published',
  draft: 'draft',
  archived: 'archived',
};

const STATUS_REVERSE: Record<CatalogItem['status'], string> = {
  published: 'active',
  draft: 'draft',
  archived: 'archived',
};

function shopifyProductToCatalogItem(tenantId: string, p: ShopifyProduct): CatalogItem {
  const variants: Variant[] = p.variants.map((v) => {
    const price: Price = {
      id: `sh_price_${v.id}`,
      variantId: `sh_var_${v.id}`,
      currency: 'USD',
      amount: Math.round(parseFloat(v.price) * 100),
    };
    return {
      id: `sh_var_${v.id}`,
      catalogItemId: `sh_${p.id}`,
      sku: v.sku || `SH-${p.id}-${v.id}`,
      title: v.title,
      prices: [price],
      inventory_quantity: v.inventory_quantity,
      allow_backorder: v.inventory_management === null,
    };
  });

  return {
    id: `sh_${p.id}`,
    tenantId,
    externalIds: [{ system: 'shopify', id: String(p.id) }],
    title: p.title,
    description: p.body_html.replace(/<[^>]+>/g, ''),
    handle: p.handle,
    status: STATUS_MAP[p.status] ?? 'draft',
    variants,
    tags: p.tags ? p.tags.split(', ').filter(Boolean) : [],
    createdAt: new Date(p.created_at),
    updatedAt: new Date(p.updated_at),
  };
}

function draftOrderToCart(tenantId: string, d: ShopifyDraftOrder): Cart {
  const lineItems: LineItem[] = d.line_items.map((li) => ({
    id: `sh_li_${li.id}`,
    cartId: `sh_do_${d.id}`,
    variantId: li.variant_id ? `sh_var_${li.variant_id}` : '',
    title: li.title,
    quantity: li.quantity,
    unitPrice: Math.round(parseFloat(li.price) * 100),
    total: Math.round(parseFloat(li.price) * li.quantity * 100),
  }));

  const total = Math.round(parseFloat(d.total_price) * 100);
  const subtotal = Math.round(parseFloat(d.subtotal_price) * 100);

  return {
    id: `sh_do_${d.id}`,
    tenantId,
    currency: d.currency,
    lineItems,
    discounts: [],
    subtotal,
    discountTotal: 0,
    shippingTotal: total - subtotal,
    taxTotal: 0,
    total,
    createdAt: new Date(d.created_at),
    updatedAt: new Date(d.updated_at),
  };
}

export class ShopifyAdapter implements EcommerceAdapter {
  readonly provider = 'shopify';
  private readonly cfg: ShopifyAdapterConfig;
  private readonly apiVersion: string;

  constructor(cfg: ShopifyAdapterConfig) {
    this.cfg = cfg;
    this.apiVersion = cfg.apiVersion ?? '2024-01';
  }

  private get baseUrl(): string {
    return `https://${this.cfg.shopDomain}/admin/api/${this.apiVersion}`;
  }

  private get headers(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': this.cfg.accessToken,
    };
  }

  private async get<T>(path: string): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      headers: this.headers,
      signal: AbortSignal.timeout(15000),
    });
    return this.parse<T>(res);
  }

  private async post<T>(path: string, body: unknown, method = 'POST'): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: this.headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
    return this.parse<T>(res);
  }

  private async del(path: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'DELETE',
      headers: this.headers,
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok && res.status !== 200) {
      const err = await res.json().catch(() => ({})) as { errors?: unknown };
      throw new Error(`Shopify ${res.status}: ${JSON.stringify(err.errors ?? {})}`);
    }
  }

  private async parse<T>(res: Response): Promise<T> {
    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as { errors?: unknown };
      throw new Error(`Shopify ${res.status}: ${JSON.stringify(err.errors ?? {})}`);
    }
    return res.json() as Promise<T>;
  }

  // ─── Catalog ───────────────────────────────────────────────────────────────

  async listProducts(params?: { limit?: number; offset?: number; status?: string }): Promise<CatalogItem[]> {
    const qs = new URLSearchParams();
    qs.set('limit', String(Math.min(params?.limit ?? 50, 250)));
    if (params?.offset) qs.set('since_id', String(params.offset));
    if (params?.status) qs.set('status', STATUS_REVERSE[params.status as CatalogItem['status']] ?? params.status);

    const data = await this.get<{ products: ShopifyProduct[] }>(`/products.json?${qs}`);
    const tid = this.cfg.tenantId ?? 'default';
    return data.products.map((p) => shopifyProductToCatalogItem(tid, p));
  }

  async getProduct(id: string): Promise<CatalogItem | null> {
    const externalId = id.startsWith('sh_') ? id.slice(3) : id;
    try {
      const data = await this.get<{ product: ShopifyProduct }>(`/products/${externalId}.json`);
      return shopifyProductToCatalogItem(this.cfg.tenantId ?? 'default', data.product);
    } catch (e) {
      if (e instanceof Error && e.message.includes('404')) return null;
      throw e;
    }
  }

  async createProduct(
    item: Omit<CatalogItem, 'id' | 'externalIds' | 'createdAt' | 'updatedAt'>,
  ): Promise<CatalogItem> {
    const body = {
      product: {
        title: item.title,
        body_html: item.description ?? '',
        handle: item.handle,
        status: STATUS_REVERSE[item.status] ?? 'draft',
        tags: item.tags?.join(', ') ?? '',
        variants: item.variants.map((v) => ({
          sku: v.sku,
          price: ((v.prices[0]?.amount ?? 0) / 100).toFixed(2),
          inventory_quantity: v.inventory_quantity ?? 0,
        })),
      },
    };
    const data = await this.post<{ product: ShopifyProduct }>('/products.json', body);
    return shopifyProductToCatalogItem(this.cfg.tenantId ?? 'default', data.product);
  }

  async updateProduct(id: string, patch: Partial<CatalogItem>): Promise<CatalogItem> {
    const externalId = id.startsWith('sh_') ? id.slice(3) : id;
    const update: Record<string, unknown> = { id: Number(externalId) };
    if (patch.title !== undefined) update['title'] = patch.title;
    if (patch.description !== undefined) update['body_html'] = patch.description;
    if (patch.status !== undefined) update['status'] = STATUS_REVERSE[patch.status] ?? 'draft';
    if (patch.tags !== undefined) update['tags'] = patch.tags.join(', ');
    const data = await this.post<{ product: ShopifyProduct }>(
      `/products/${externalId}.json`,
      { product: update },
      'PUT',
    );
    return shopifyProductToCatalogItem(this.cfg.tenantId ?? 'default', data.product);
  }

  async deleteProduct(id: string): Promise<void> {
    const externalId = id.startsWith('sh_') ? id.slice(3) : id;
    await this.del(`/products/${externalId}.json`);
  }

  // ─── Cart via Draft Orders ─────────────────────────────────────────────────

  async getCart(cartId: string): Promise<Cart | null> {
    const externalId = cartId.startsWith('sh_do_') ? cartId.slice(6) : cartId;
    try {
      const data = await this.get<{ draft_order: ShopifyDraftOrder }>(`/draft_orders/${externalId}.json`);
      return draftOrderToCart(this.cfg.tenantId ?? 'default', data.draft_order);
    } catch (e) {
      if (e instanceof Error && e.message.includes('404')) return null;
      throw e;
    }
  }

  async createCart(params?: { currency?: string }): Promise<Cart> {
    const body: Record<string, unknown> = { draft_order: { line_items: [] } };
    if (params?.currency) body['draft_order'] = { ...body['draft_order'] as object, currency: params.currency };
    const data = await this.post<{ draft_order: ShopifyDraftOrder }>('/draft_orders.json', body);
    return draftOrderToCart(this.cfg.tenantId ?? 'default', data.draft_order);
  }

  async addLineItem(cartId: string, variantId: string, quantity: number): Promise<Cart> {
    const externalId = cartId.startsWith('sh_do_') ? cartId.slice(6) : cartId;
    const externalVariantId = variantId.startsWith('sh_var_') ? variantId.slice(7) : variantId;
    const current = await this.get<{ draft_order: ShopifyDraftOrder }>(`/draft_orders/${externalId}.json`);
    const items = [
      ...current.draft_order.line_items.map((li) => ({
        variant_id: li.variant_id,
        quantity: li.quantity,
      })),
      { variant_id: Number(externalVariantId), quantity },
    ];
    const data = await this.post<{ draft_order: ShopifyDraftOrder }>(
      `/draft_orders/${externalId}.json`,
      { draft_order: { line_items: items } },
      'PUT',
    );
    return draftOrderToCart(this.cfg.tenantId ?? 'default', data.draft_order);
  }

  async removeLineItem(cartId: string, lineItemId: string): Promise<Cart> {
    const externalId = cartId.startsWith('sh_do_') ? cartId.slice(6) : cartId;
    const current = await this.get<{ draft_order: ShopifyDraftOrder }>(`/draft_orders/${externalId}.json`);
    const externalLineId = lineItemId.startsWith('sh_li_') ? Number(lineItemId.slice(6)) : Number(lineItemId);
    const items = current.draft_order.line_items
      .filter((li) => li.id !== externalLineId)
      .map((li) => ({ variant_id: li.variant_id, quantity: li.quantity }));
    const data = await this.post<{ draft_order: ShopifyDraftOrder }>(
      `/draft_orders/${externalId}.json`,
      { draft_order: { line_items: items } },
      'PUT',
    );
    return draftOrderToCart(this.cfg.tenantId ?? 'default', data.draft_order);
  }

  async completeCart(
    cartId: string,
  ): Promise<{ type: 'order' | 'swap' | 'cart'; data: Record<string, unknown> }> {
    const externalId = cartId.startsWith('sh_do_') ? cartId.slice(6) : cartId;
    const data = await this.post<{ draft_order: ShopifyDraftOrder }>(
      `/draft_orders/${externalId}/complete.json`,
      {},
    );
    return { type: 'order', data: data.draft_order as unknown as Record<string, unknown> };
  }
}

export function createShopifyAdapter(cfg: ShopifyAdapterConfig | null): ShopifyAdapter | null {
  if (!cfg?.shopDomain || !cfg?.accessToken) return null;
  return new ShopifyAdapter(cfg);
}
