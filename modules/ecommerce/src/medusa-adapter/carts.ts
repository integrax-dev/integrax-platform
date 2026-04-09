/**
 * Medusa adapter — cart translation
 *
 * Translates between Medusa cart models and IntegraX Cart/CheckoutSession.
 */

import type { Cart, LineItem, Address, Discount, CheckoutSession } from '../types.js';
import type { MedusaCart, MedusaLineItem, MedusaAddress, MedusaDiscount } from './types.js';

export function medusaCartToCart(tenantId: string, cart: MedusaCart): Cart {
  return {
    id: cart.id,
    tenantId,
    customerId: cart.customer_id ?? undefined,
    email: cart.email ?? undefined,
    currency: cart.currency_code,
    lineItems: cart.items.map(medusaLineItemToLineItem),
    shippingAddress: cart.shipping_address ? medusaAddressToAddress(cart.shipping_address) : undefined,
    billingAddress: cart.billing_address ? medusaAddressToAddress(cart.billing_address) : undefined,
    discounts: cart.discounts.map(medusaDiscountToDiscount),
    subtotal: cart.subtotal,
    discountTotal: cart.discount_total,
    shippingTotal: cart.shipping_total,
    taxTotal: cart.tax_total,
    total: cart.total,
    completedAt: cart.completed_at ? new Date(cart.completed_at) : undefined,
    createdAt: new Date(cart.created_at),
    updatedAt: new Date(cart.updated_at),
  };
}

function medusaLineItemToLineItem(item: MedusaLineItem): LineItem {
  return {
    id: item.id,
    cartId: item.cart_id,
    variantId: item.variant_id,
    title: item.title,
    quantity: item.quantity,
    unitPrice: item.unit_price,
    total: item.subtotal,
    metadata: item.metadata ?? undefined,
  };
}

function medusaAddressToAddress(addr: MedusaAddress): Address {
  return {
    firstName: addr.first_name ?? undefined,
    lastName: addr.last_name ?? undefined,
    company: addr.company ?? undefined,
    address1: addr.address_1,
    address2: addr.address_2 ?? undefined,
    city: addr.city,
    province: addr.province ?? undefined,
    postalCode: addr.postal_code ?? undefined,
    countryCode: addr.country_code,
    phone: addr.phone ?? undefined,
  };
}

function medusaDiscountToDiscount(d: MedusaDiscount): Discount {
  return {
    id: d.id,
    code: d.code,
    rule: {
      id: d.id,
      type: d.rule.type as Discount['rule']['type'],
      value: d.rule.value,
    },
    usageCount: d.usage_count,
    usageLimit: d.usage_limit ?? undefined,
    startsAt: d.starts_at ? new Date(d.starts_at) : undefined,
    endsAt: d.ends_at ? new Date(d.ends_at) : undefined,
    isDisabled: d.is_disabled,
  };
}

export function cartToCheckoutSession(cart: Cart): CheckoutSession {
  return {
    id: `cs_${cart.id}`,
    cartId: cart.id,
    tenantId: cart.tenantId,
    status: cart.completedAt ? 'completed' : 'pending',
    completedAt: cart.completedAt,
    createdAt: cart.createdAt,
  };
}
