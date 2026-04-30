/**
 * EcommerceAdapter interface
 *
 * Common contract for all ecommerce platform adapters.
 * Each adapter maps the platform's native API to IntegraX's canonical types.
 *
 * Cart methods are optional — not all platforms expose a headless cart API.
 * The EcommerceService falls back to snapshot-store when a method is absent.
 */

import type { CatalogItem, Cart } from './types.js';

export interface EcommerceAdapter {
  readonly provider: string;

  // ─── Catalog ───────────────────────────────────────────────────────────────

  listProducts(params?: {
    limit?: number;
    offset?: number;
    status?: string;
  }): Promise<CatalogItem[]>;

  getProduct(id: string): Promise<CatalogItem | null>;

  createProduct(
    item: Omit<CatalogItem, 'id' | 'externalIds' | 'createdAt' | 'updatedAt'>,
  ): Promise<CatalogItem>;

  updateProduct(id: string, patch: Partial<CatalogItem>): Promise<CatalogItem>;

  deleteProduct(id: string): Promise<void>;

  // ─── Cart (optional) ───────────────────────────────────────────────────────

  getCart?(cartId: string): Promise<Cart | null>;

  createCart?(params?: { salesChannelId?: string; currency?: string }): Promise<Cart>;

  addLineItem?(cartId: string, variantId: string, quantity: number): Promise<Cart>;

  removeLineItem?(cartId: string, lineItemId: string): Promise<Cart>;

  applyDiscount?(cartId: string, discountCode: string): Promise<Cart>;

  completeCart?(
    cartId: string,
  ): Promise<{ type: 'order' | 'swap' | 'cart'; data: Record<string, unknown> }>;
}
