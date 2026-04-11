/**
 * Ecommerce layer types
 *
 * These are ecommerce-layer concepts — not universal platform core entities.
 * They live here and bridge to canonical entities (packages/entities) when needed.
 *
 * The Medusa adapter translates between Medusa models and these types.
 */

import type { ExternalId } from '@integrax/entities';

// ─── Catalog ──────────────────────────────────────────────────────────────────

export interface CatalogItem {
  id: string;
  tenantId: string;
  externalIds: ExternalId[];
  title: string;
  description?: string;
  handle: string;        // URL-friendly slug
  status: 'draft' | 'published' | 'archived';
  variants: Variant[];
  tags?: string[];
  collectionId?: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface Variant {
  id: string;
  catalogItemId: string;
  sku: string;
  title: string;
  prices: Price[];
  inventory_quantity?: number;
  allow_backorder?: boolean;
  metadata?: Record<string, unknown>;
}

export interface Price {
  id: string;
  variantId: string;
  currency: string;
  amount: number;   // in smallest currency unit
  listId?: string;  // price list id
  startsAt?: Date;
  endsAt?: Date;
}

// ─── Pricing ──────────────────────────────────────────────────────────────────

export interface PriceList {
  id: string;
  tenantId: string;
  name: string;
  type: 'sale' | 'override';
  status: 'active' | 'draft';
  startsAt?: Date;
  endsAt?: Date;
  prices: Price[];
}

export interface SalesChannel {
  id: string;
  tenantId: string;
  name: string;
  description?: string;
  isDisabled: boolean;
}

// ─── Cart / Checkout ──────────────────────────────────────────────────────────

export interface Cart {
  id: string;
  tenantId: string;
  salesChannelId?: string;
  customerId?: string;
  email?: string;
  currency: string;
  lineItems: LineItem[];
  shippingAddress?: Address;
  billingAddress?: Address;
  discounts: Discount[];
  subtotal: number;
  discountTotal: number;
  shippingTotal: number;
  taxTotal: number;
  total: number;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface LineItem {
  id: string;
  cartId: string;
  variantId: string;
  title: string;
  quantity: number;
  unitPrice: number;
  total: number;
  metadata?: Record<string, unknown>;
}

export interface Address {
  firstName?: string;
  lastName?: string;
  company?: string;
  address1: string;
  address2?: string;
  city: string;
  province?: string;
  postalCode?: string;
  countryCode: string;
  phone?: string;
}

export interface CheckoutSession {
  id: string;
  cartId: string;
  tenantId: string;
  status: 'pending' | 'payment_required' | 'completed' | 'abandoned';
  paymentSessionId?: string;
  completedAt?: Date;
  createdAt: Date;
}

// ─── Promotions ───────────────────────────────────────────────────────────────

export interface Discount {
  id: string;
  code: string;
  rule: DiscountRule;
  usageCount: number;
  usageLimit?: number;
  startsAt?: Date;
  endsAt?: Date;
  isDisabled: boolean;
}

export interface DiscountRule {
  id: string;
  type: 'percentage' | 'fixed' | 'free_shipping';
  value: number;
  conditions?: DiscountCondition[];
}

export interface DiscountCondition {
  type: 'product' | 'variant' | 'product_collection' | 'customer_group';
  operator: 'in' | 'not_in';
  ids: string[];
}

// ─── Customer ─────────────────────────────────────────────────────────────────

export interface CustomerAccount {
  id: string;
  tenantId: string;
  email: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  billingAddress?: Address;
  hasAccount: boolean;    // registered vs guest
  createdAt: Date;
}

// ─── Orders / Fulfillment ─────────────────────────────────────────────────────

export interface DraftOrder {
  id: string;
  tenantId: string;
  status: 'open' | 'completed' | 'canceled';
  cartId?: string;
  customerId?: string;
  lineItems: LineItem[];
  currency: string;
  total: number;
  createdAt: Date;
}

export interface FulfillmentRequest {
  orderId: string;
  tenantId: string;
  items: Array<{ variantId: string; quantity: number }>;
  locationId?: string;
  providerId?: string;   // fulfillment provider (e.g. 'manual', 'shipper-x')
  metadata?: Record<string, unknown>;
}

export interface ReturnRequest {
  orderId: string;
  tenantId: string;
  items: Array<{ lineItemId: string; quantity: number; reason?: string }>;
  refundAmount?: number;
  note?: string;
}

export interface InventoryAllocation {
  variantId: string;
  tenantId: string;
  locationId: string;
  orderId: string;
  quantity: number;
  allocatedAt: Date;
}
