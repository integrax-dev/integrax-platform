/**
 * Medusa adapter — internal types
 *
 * These are Medusa-specific model shapes used ONLY inside the adapter.
 * Nothing outside medusa-adapter/ should import from here.
 *
 * We define minimal interfaces for the Medusa concepts we consume — we don't
 * import Medusa types directly to keep the peer dependency optional.
 */

// ─── Minimal Medusa shapes ────────────────────────────────────────────────────
// Only the fields we actually map. Add as needed — don't copy the full Medusa models.

export interface MedusaProduct {
  id: string;
  handle: string;
  title: string;
  description?: string | null;
  status: 'draft' | 'published' | 'proposed' | 'rejected';
  variants: MedusaVariant[];
  tags?: Array<{ id: string; value: string }>;
  collection_id?: string | null;
  metadata?: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface MedusaVariant {
  id: string;
  product_id: string;
  sku?: string | null;
  title: string;
  prices: MedusaMoneyAmount[];
  inventory_quantity: number;
  allow_backorder: boolean;
  metadata?: Record<string, unknown> | null;
}

export interface MedusaMoneyAmount {
  id: string;
  variant_id: string;
  currency_code: string;
  amount: number;
  price_list_id?: string | null;
  starts_at?: string | null;
  ends_at?: string | null;
}

export interface MedusaCart {
  id: string;
  customer_id?: string | null;
  email?: string | null;
  currency_code: string;
  items: MedusaLineItem[];
  region_id: string;
  discounts: MedusaDiscount[];
  shipping_address?: MedusaAddress | null;
  billing_address?: MedusaAddress | null;
  subtotal: number;
  discount_total: number;
  shipping_total: number;
  tax_total: number;
  total: number;
  completed_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface MedusaLineItem {
  id: string;
  cart_id: string;
  variant_id: string;
  title: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
  metadata?: Record<string, unknown> | null;
}

export interface MedusaAddress {
  first_name?: string | null;
  last_name?: string | null;
  company?: string | null;
  address_1: string;
  address_2?: string | null;
  city: string;
  province?: string | null;
  postal_code?: string | null;
  country_code: string;
  phone?: string | null;
}

export interface MedusaDiscount {
  id: string;
  code: string;
  rule: { type: string; value: number };
  usage_count: number;
  usage_limit?: number | null;
  starts_at?: string | null;
  ends_at?: string | null;
  is_disabled: boolean;
}

export interface MedusaOrder {
  id: string;
  status: string;
  customer_id?: string | null;
  email: string;
  currency_code: string;
  items: MedusaLineItem[];
  total: number;
  created_at: string;
}
