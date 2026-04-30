/**
 * Medusa Adapter
 *
 * The single entry point for all Medusa integration.
 * Everything Medusa-specific is contained here.
 *
 * The adapter communicates with Medusa via its REST API (store or admin).
 * It does NOT import @medusajs/medusa or any Medusa SDK directly — this keeps
 * the peer dependency truly optional and the adapter testable without Medusa running.
 *
 * If @medusajs/medusa is available as a peer, callers can pass a medusaBaseUrl
 * pointing to a running Medusa instance. Otherwise, the adapter throws
 * MedusaAdapterNotConfiguredError on every call.
 *
 * Integrax components must NEVER import from this file directly — they use the
 * EcommerceService which calls this adapter internally.
 */

import type { EcommerceAdapter } from '../adapter.js';
import type { CatalogItem, Cart } from '../types.js';
import type { MedusaProduct, MedusaCart } from './types.js';
import { medusaProductToCatalogItem, catalogItemToMedusaProduct } from './catalog.js';
import { medusaCartToCart } from './carts.js';

export class MedusaAdapterNotConfiguredError extends Error {
  constructor() {
    super(
      'MedusaAdapter is not configured. Provide medusaBaseUrl + medusaAdminApiKey to enable ecommerce features. ' +
      'Alternatively, implement the EcommerceAdapter interface directly without Medusa.',
    );
    this.name = 'MedusaAdapterNotConfiguredError';
  }
}

export interface MedusaAdapterConfig {
  /** Base URL of the Medusa admin API (e.g. http://localhost:9000) */
  medusaBaseUrl: string;
  /** Medusa admin API key or session token */
  medusaAdminApiKey: string;
  /** Optional tenant context — passed as x-medusa-tenant-id header if set */
  tenantId?: string;
}

export class MedusaAdapter implements EcommerceAdapter {
  readonly provider = 'medusa';
  private readonly config: MedusaAdapterConfig;

  constructor(config: MedusaAdapterConfig) {
    this.config = config;
  }

  // ─── Catalog ───────────────────────────────────────────────────────────────

  async listProducts(params?: {
    limit?: number;
    offset?: number;
    status?: string;
  }): Promise<CatalogItem[]> {
    const qs = new URLSearchParams();
    if (params?.limit) qs.set('limit', String(params.limit));
    if (params?.offset) qs.set('offset', String(params.offset));
    if (params?.status) qs.set('status[]', params.status);

    const data = await this.adminGet<{ products: MedusaProduct[] }>(`/products?${qs}`);
    return data.products.map(p => medusaProductToCatalogItem(this.config.tenantId ?? 'default', p));
  }

  async getProduct(productId: string): Promise<CatalogItem | null> {
    try {
      const data = await this.adminGet<{ product: MedusaProduct }>(`/products/${productId}`);
      return medusaProductToCatalogItem(this.config.tenantId ?? 'default', data.product);
    } catch (e: unknown) {
      if (e instanceof Error && e.message.includes('404')) return null;
      throw e;
    }
  }

  async createProduct(item: Omit<CatalogItem, 'id' | 'externalIds' | 'createdAt' | 'updatedAt'>): Promise<CatalogItem> {
    const body = catalogItemToMedusaProduct(item as CatalogItem);
    const data = await this.adminPost<{ product: MedusaProduct }>('/products', body);
    return medusaProductToCatalogItem(this.config.tenantId ?? 'default', data.product);
  }

  async updateProduct(productId: string, patch: Partial<CatalogItem>): Promise<CatalogItem> {
    const body = catalogItemToMedusaProduct(patch as CatalogItem);
    const data = await this.adminPost<{ product: MedusaProduct }>(`/products/${productId}`, body, 'POST');
    return medusaProductToCatalogItem(this.config.tenantId ?? 'default', data.product);
  }

  async deleteProduct(productId: string): Promise<void> {
    await this.adminDelete(`/products/${productId}`);
  }

  // ─── Carts ─────────────────────────────────────────────────────────────────

  async getCart(cartId: string): Promise<Cart | null> {
    try {
      const data = await this.storeGet<{ cart: MedusaCart }>(`/carts/${cartId}`);
      return medusaCartToCart(this.config.tenantId ?? 'default', data.cart);
    } catch (e: unknown) {
      if (e instanceof Error && e.message.includes('404')) return null;
      throw e;
    }
  }

  async createCart(params?: { salesChannelId?: string; currency?: string }): Promise<Cart> {
    const body: Record<string, unknown> = {};
    if (params?.salesChannelId) body.sales_channel_id = params.salesChannelId;
    if (params?.currency) body.currency_code = params.currency;
    const data = await this.storePost<{ cart: MedusaCart }>('/carts', body);
    return medusaCartToCart(this.config.tenantId ?? 'default', data.cart);
  }

  async addLineItem(cartId: string, variantId: string, quantity: number): Promise<Cart> {
    const data = await this.storePost<{ cart: MedusaCart }>(
      `/carts/${cartId}/line-items`,
      { variant_id: variantId, quantity },
    );
    return medusaCartToCart(this.config.tenantId ?? 'default', data.cart);
  }

  async removeLineItem(cartId: string, lineItemId: string): Promise<Cart> {
    const data = await this.storeDelete<{ cart: MedusaCart }>(`/carts/${cartId}/line-items/${lineItemId}`);
    return medusaCartToCart(this.config.tenantId ?? 'default', data.cart);
  }

  async applyDiscount(cartId: string, discountCode: string): Promise<Cart> {
    const data = await this.storePost<{ cart: MedusaCart }>(
      `/carts/${cartId}/discounts/${discountCode}`,
      {},
    );
    return medusaCartToCart(this.config.tenantId ?? 'default', data.cart);
  }

  async completeCart(cartId: string): Promise<{ type: 'order' | 'swap' | 'cart'; data: Record<string, unknown> }> {
    return this.storePost(`/carts/${cartId}/complete`, {});
  }

  // ─── HTTP helpers ──────────────────────────────────────────────────────────

  private get adminHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.config.medusaAdminApiKey}`,
      ...(this.config.tenantId ? { 'x-medusa-tenant-id': this.config.tenantId } : {}),
    };
  }

  private get storeHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      ...(this.config.tenantId ? { 'x-publishable-api-key': this.config.medusaAdminApiKey } : {}),
    };
  }

  private async adminGet<T>(path: string): Promise<T> {
    const res = await fetch(`${this.config.medusaBaseUrl}/admin${path}`, {
      headers: this.adminHeaders,
      signal: AbortSignal.timeout(15000),
    });
    return this.parseResponse<T>(res);
  }

  private async adminPost<T>(path: string, body: unknown, method = 'POST'): Promise<T> {
    const res = await fetch(`${this.config.medusaBaseUrl}/admin${path}`, {
      method,
      headers: this.adminHeaders,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
    return this.parseResponse<T>(res);
  }

  private async adminDelete<T>(path: string): Promise<T> {
    const res = await fetch(`${this.config.medusaBaseUrl}/admin${path}`, {
      method: 'DELETE',
      headers: this.adminHeaders,
      signal: AbortSignal.timeout(15000),
    });
    return this.parseResponse<T>(res);
  }

  private async storeGet<T>(path: string): Promise<T> {
    const res = await fetch(`${this.config.medusaBaseUrl}/store${path}`, {
      headers: this.storeHeaders,
      signal: AbortSignal.timeout(15000),
    });
    return this.parseResponse<T>(res);
  }

  private async storePost<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${this.config.medusaBaseUrl}/store${path}`, {
      method: 'POST',
      headers: this.storeHeaders,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
    return this.parseResponse<T>(res);
  }

  private async storeDelete<T>(path: string): Promise<T> {
    const res = await fetch(`${this.config.medusaBaseUrl}/store${path}`, {
      method: 'DELETE',
      headers: this.storeHeaders,
      signal: AbortSignal.timeout(15000),
    });
    return this.parseResponse<T>(res);
  }

  private async parseResponse<T>(res: Response): Promise<T> {
    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as { message?: string; type?: string };
      throw new Error(`Medusa ${res.status}: ${err.message ?? err.type ?? 'Unknown error'}`);
    }
    return res.json() as Promise<T>;
  }
}

/** Factory — returns null if config is not provided, not an error */
export function createMedusaAdapter(config: MedusaAdapterConfig | null): MedusaAdapter | null {
  if (!config?.medusaBaseUrl || !config?.medusaAdminApiKey) return null;
  return new MedusaAdapter(config);
}
