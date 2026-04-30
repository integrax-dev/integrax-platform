/**
 * WooCommerce Adapter
 *
 * WordPress-native ecommerce. Very high penetration in Argentine SMBs.
 * Uses the WooCommerce REST API v3 (included since WC 3.5).
 *
 * Auth: HTTP Basic — consumer_key:consumer_secret encoded as Base64,
 * OR query params ?consumer_key=&consumer_secret= for servers that block
 * Authorization headers (common with shared hosting). We use Basic by default.
 *
 * Products in WooCommerce map directly to CatalogItem + Variant model.
 * Simple products get one synthetic variant; variable products map to WC variations.
 *
 * Docs: https://woocommerce.github.io/woocommerce-rest-api-docs/
 */

import type { EcommerceAdapter } from '../adapter.js';
import type { CatalogItem, Variant, Price, Cart, LineItem } from '../types.js';
import { ulid } from '@integrax/entities';

export interface WooCommerceAdapterConfig {
  siteUrl: string;         // e.g. https://mitienda.com.ar
  consumerKey: string;
  consumerSecret: string;
  currency?: string;       // default: ARS
  tenantId?: string;
}

interface WCImage {
  id: number;
  src: string;
  alt: string;
}

interface WCVariation {
  id: number;
  sku: string;
  price: string;
  regular_price: string;
  stock_quantity: number | null;
  manage_stock: boolean;
  attributes: Array<{ name: string; option: string }>;
}

interface WCProduct {
  id: number;
  name: string;
  slug: string;
  status: 'publish' | 'draft' | 'pending' | 'private' | 'trash';
  description: string;
  short_description: string;
  sku: string;
  price: string;
  regular_price: string;
  stock_quantity: number | null;
  manage_stock: boolean;
  type: 'simple' | 'variable' | 'grouped' | 'external';
  variations: number[];
  images: WCImage[];
  tags: Array<{ id: number; name: string; slug: string }>;
  date_created: string;
  date_modified: string;
}

interface WCOrder {
  id: number;
  status: string;
  currency: string;
  line_items: Array<{
    id: number;
    product_id: number;
    variation_id: number;
    name: string;
    quantity: number;
    price: number;
    total: string;
  }>;
  total: string;
  subtotal: string;
  date_created: string;
  date_modified: string;
}

const WC_STATUS_MAP: Record<string, CatalogItem['status']> = {
  publish: 'published',
  draft: 'draft',
  pending: 'draft',
  private: 'draft',
  trash: 'archived',
};

const STATUS_REVERSE: Record<CatalogItem['status'], string> = {
  published: 'publish',
  draft: 'draft',
  archived: 'trash',
};

function wcProductToCatalogItem(
  tenantId: string,
  p: WCProduct,
  variations: WCVariation[],
  currency: string,
): CatalogItem {
  let variants: Variant[];

  if (p.type === 'variable' && variations.length) {
    variants = variations.map((v) => {
      const price: Price = {
        id: `wc_price_${v.id}`,
        variantId: `wc_var_${v.id}`,
        currency,
        amount: Math.round(parseFloat(v.price || v.regular_price || '0') * 100),
      };
      return {
        id: `wc_var_${v.id}`,
        catalogItemId: `wc_${p.id}`,
        sku: v.sku || `WC-${p.id}-${v.id}`,
        title: v.attributes.map((a) => `${a.name}: ${a.option}`).join(', ') || 'Default',
        prices: [price],
        inventory_quantity: v.stock_quantity ?? undefined,
        allow_backorder: !v.manage_stock,
      };
    });
  } else {
    const price: Price = {
      id: `wc_price_${p.id}`,
      variantId: `wc_var_${p.id}`,
      currency,
      amount: Math.round(parseFloat(p.price || p.regular_price || '0') * 100),
    };
    variants = [{
      id: `wc_var_${p.id}`,
      catalogItemId: `wc_${p.id}`,
      sku: p.sku || `WC-${p.id}`,
      title: 'Default',
      prices: [price],
      inventory_quantity: p.stock_quantity ?? undefined,
      allow_backorder: !p.manage_stock,
    }];
  }

  return {
    id: `wc_${p.id}`,
    tenantId,
    externalIds: [{ system: 'woocommerce', id: String(p.id) }],
    title: p.name,
    description: p.description || p.short_description,
    handle: p.slug,
    status: WC_STATUS_MAP[p.status] ?? 'draft',
    variants,
    tags: p.tags.map((t) => t.name),
    createdAt: new Date(p.date_created),
    updatedAt: new Date(p.date_modified),
  };
}

function wcOrderToCart(tenantId: string, o: WCOrder, currency: string): Cart {
  const lineItems: LineItem[] = o.line_items.map((li) => ({
    id: `wc_li_${li.id}`,
    cartId: `wc_order_${o.id}`,
    variantId: li.variation_id ? `wc_var_${li.variation_id}` : `wc_var_${li.product_id}`,
    title: li.name,
    quantity: li.quantity,
    unitPrice: Math.round(li.price * 100),
    total: Math.round(parseFloat(li.total) * 100),
  }));

  const total = Math.round(parseFloat(o.total) * 100);

  return {
    id: `wc_order_${o.id}`,
    tenantId,
    currency: o.currency || currency,
    lineItems,
    discounts: [],
    subtotal: Math.round(parseFloat(o.subtotal || o.total) * 100),
    discountTotal: 0,
    shippingTotal: 0,
    taxTotal: 0,
    total,
    createdAt: new Date(o.date_created),
    updatedAt: new Date(o.date_modified),
  };
}

export class WooCommerceAdapter implements EcommerceAdapter {
  readonly provider = 'woocommerce';
  private readonly cfg: WooCommerceAdapterConfig;
  private readonly currency: string;

  constructor(cfg: WooCommerceAdapterConfig) {
    this.cfg = cfg;
    this.currency = cfg.currency ?? 'ARS';
  }

  private get baseUrl(): string {
    return `${this.cfg.siteUrl.replace(/\/$/, '')}/wp-json/wc/v3`;
  }

  private get authHeader(): string {
    const token = Buffer.from(`${this.cfg.consumerKey}:${this.cfg.consumerSecret}`).toString('base64');
    return `Basic ${token}`;
  }

  private get headers(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      Authorization: this.authHeader,
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
    const res = await fetch(`${this.baseUrl}${path}?force=true`, {
      method: 'DELETE',
      headers: this.headers,
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok && res.status !== 200) {
      const err = await res.json().catch(() => ({})) as { message?: string; code?: string };
      throw new Error(`WooCommerce ${res.status}: ${err.message ?? err.code ?? 'Unknown error'}`);
    }
  }

  private async parse<T>(res: Response): Promise<T> {
    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as { message?: string; code?: string };
      throw new Error(`WooCommerce ${res.status}: ${err.message ?? err.code ?? 'Unknown error'}`);
    }
    return res.json() as Promise<T>;
  }

  private async fetchVariations(productId: string | number): Promise<WCVariation[]> {
    try {
      return await this.get<WCVariation[]>(`/products/${productId}/variations?per_page=100`);
    } catch {
      return [];
    }
  }

  // ─── Catalog ───────────────────────────────────────────────────────────────

  async listProducts(params?: { limit?: number; offset?: number; status?: string }): Promise<CatalogItem[]> {
    const qs = new URLSearchParams();
    qs.set('per_page', String(Math.min(params?.limit ?? 20, 100)));
    if (params?.offset) qs.set('offset', String(params.offset));
    if (params?.status) qs.set('status', STATUS_REVERSE[params.status as CatalogItem['status']] ?? params.status);

    const products = await this.get<WCProduct[]>(`/products?${qs}`);
    const tid = this.cfg.tenantId ?? 'default';

    return Promise.all(
      products.map(async (p) => {
        const variations = p.type === 'variable' && p.variations.length
          ? await this.fetchVariations(p.id)
          : [];
        return wcProductToCatalogItem(tid, p, variations, this.currency);
      }),
    );
  }

  async getProduct(id: string): Promise<CatalogItem | null> {
    const externalId = id.startsWith('wc_') ? id.slice(3) : id;
    try {
      const p = await this.get<WCProduct>(`/products/${externalId}`);
      const variations = p.type === 'variable' ? await this.fetchVariations(p.id) : [];
      return wcProductToCatalogItem(this.cfg.tenantId ?? 'default', p, variations, this.currency);
    } catch (e) {
      if (e instanceof Error && e.message.includes('404')) return null;
      throw e;
    }
  }

  async createProduct(
    item: Omit<CatalogItem, 'id' | 'externalIds' | 'createdAt' | 'updatedAt'>,
  ): Promise<CatalogItem> {
    const isVariable = item.variants.length > 1;
    const body: Record<string, unknown> = {
      name: item.title,
      slug: item.handle,
      status: STATUS_REVERSE[item.status] ?? 'draft',
      description: item.description ?? '',
      type: isVariable ? 'variable' : 'simple',
      tags: item.tags?.map((name) => ({ name })) ?? [],
    };

    if (!isVariable && item.variants[0]) {
      const v = item.variants[0];
      body['sku'] = v.sku;
      body['regular_price'] = ((v.prices[0]?.amount ?? 0) / 100).toFixed(2);
      body['stock_quantity'] = v.inventory_quantity ?? null;
      body['manage_stock'] = v.inventory_quantity !== undefined;
    }

    const p = await this.post<WCProduct>('/products', body);
    return wcProductToCatalogItem(this.cfg.tenantId ?? 'default', p, [], this.currency);
  }

  async updateProduct(id: string, patch: Partial<CatalogItem>): Promise<CatalogItem> {
    const externalId = id.startsWith('wc_') ? id.slice(3) : id;
    const body: Record<string, unknown> = {};
    if (patch.title !== undefined) body['name'] = patch.title;
    if (patch.description !== undefined) body['description'] = patch.description;
    if (patch.handle !== undefined) body['slug'] = patch.handle;
    if (patch.status !== undefined) body['status'] = STATUS_REVERSE[patch.status] ?? 'draft';
    if (patch.tags !== undefined) body['tags'] = patch.tags.map((name) => ({ name }));
    const p = await this.post<WCProduct>(`/products/${externalId}`, body, 'PUT');
    return wcProductToCatalogItem(this.cfg.tenantId ?? 'default', p, [], this.currency);
  }

  async deleteProduct(id: string): Promise<void> {
    const externalId = id.startsWith('wc_') ? id.slice(3) : id;
    await this.del(`/products/${externalId}`);
  }

  // ─── Cart via WC Orders ────────────────────────────────────────────────────

  async createCart(params?: { currency?: string }): Promise<Cart> {
    const body = {
      status: 'pending',
      currency: params?.currency ?? this.currency,
      line_items: [],
    };
    const order = await this.post<WCOrder>('/orders', body);
    return wcOrderToCart(this.cfg.tenantId ?? 'default', order, this.currency);
  }

  async getCart(cartId: string): Promise<Cart | null> {
    const externalId = cartId.startsWith('wc_order_') ? cartId.slice(9) : cartId;
    try {
      const order = await this.get<WCOrder>(`/orders/${externalId}`);
      return wcOrderToCart(this.cfg.tenantId ?? 'default', order, this.currency);
    } catch (e) {
      if (e instanceof Error && e.message.includes('404')) return null;
      throw e;
    }
  }

  async addLineItem(cartId: string, variantId: string, quantity: number): Promise<Cart> {
    const externalOrderId = cartId.startsWith('wc_order_') ? cartId.slice(9) : cartId;
    const isVariation = variantId.startsWith('wc_var_');
    const numericId = isVariation
      ? Number(variantId.slice(7))
      : Number(variantId.startsWith('wc_') ? variantId.slice(3) : variantId);

    const current = await this.get<WCOrder>(`/orders/${externalOrderId}`);
    const existing = current.line_items.find((li) =>
      isVariation ? li.variation_id === numericId : li.product_id === numericId,
    );

    const lineItems = existing
      ? current.line_items.map((li) =>
          (isVariation ? li.variation_id : li.product_id) === numericId
            ? { ...li, quantity: li.quantity + quantity }
            : li,
        )
      : [
          ...current.line_items,
          isVariation
            ? { variation_id: numericId, quantity }
            : { product_id: numericId, quantity },
        ];

    const updated = await this.post<WCOrder>(
      `/orders/${externalOrderId}`,
      { line_items: lineItems },
      'PUT',
    );
    return wcOrderToCart(this.cfg.tenantId ?? 'default', updated, this.currency);
  }

  async removeLineItem(cartId: string, lineItemId: string): Promise<Cart> {
    const externalOrderId = cartId.startsWith('wc_order_') ? cartId.slice(9) : cartId;
    const externalLineId = lineItemId.startsWith('wc_li_') ? Number(lineItemId.slice(6)) : Number(lineItemId);
    const current = await this.get<WCOrder>(`/orders/${externalOrderId}`);
    const lineItems = current.line_items
      .filter((li) => li.id !== externalLineId)
      .map((li) => ({ id: li.id, quantity: li.quantity }));
    const updated = await this.post<WCOrder>(
      `/orders/${externalOrderId}`,
      { line_items: lineItems },
      'PUT',
    );
    return wcOrderToCart(this.cfg.tenantId ?? 'default', updated, this.currency);
  }

  async completeCart(
    cartId: string,
  ): Promise<{ type: 'order' | 'swap' | 'cart'; data: Record<string, unknown> }> {
    const externalId = cartId.startsWith('wc_order_') ? cartId.slice(9) : cartId;
    const updated = await this.post<WCOrder>(
      `/orders/${externalId}`,
      { status: 'processing' },
      'PUT',
    );
    return { type: 'order', data: updated as unknown as Record<string, unknown> };
  }
}

export function createWooCommerceAdapter(cfg: WooCommerceAdapterConfig | null): WooCommerceAdapter | null {
  if (!cfg?.siteUrl || !cfg?.consumerKey || !cfg?.consumerSecret) return null;
  return new WooCommerceAdapter(cfg);
}
