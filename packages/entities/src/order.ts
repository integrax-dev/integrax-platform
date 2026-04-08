import type { ExternalId } from './external-id.js';

export type OrderStatus =
  | 'pending'
  | 'confirmed'
  | 'processing'
  | 'shipped'
  | 'delivered'
  | 'cancelled'
  | 'refunded';

export interface OrderItem {
  sku?: string;
  title: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  externalProductId?: string;
}

export interface OrderAmounts {
  subtotal: number;
  tax?: number;
  shipping?: number;
  discount?: number;
  total: number;
}

export interface Order {
  id?: string;
  externalIds: ExternalId[];
  status: OrderStatus;
  items: OrderItem[];
  customerTaxId?: string;
  customerName?: string;
  customerEmail?: string;
  amounts: OrderAmounts;
  currency: string;
  shippingAddress?: string;
  notes?: string;
  sourceSystem: string;
  createdAt: Date;
  updatedAt: Date;
}
