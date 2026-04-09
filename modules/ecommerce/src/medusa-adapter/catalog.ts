/**
 * Medusa adapter — catalog translation
 *
 * Translates between Medusa product/variant models and IntegraX CatalogItem/Variant.
 * This file is the only place Medusa's product shape is known.
 */

import type { CatalogItem, Variant, Price } from '../types.js';
import type { MedusaProduct, MedusaVariant, MedusaMoneyAmount } from './types.js';

export function medusaProductToCatalogItem(
  tenantId: string,
  product: MedusaProduct,
): CatalogItem {
  return {
    id: product.id,
    tenantId,
    externalIds: [{ system: 'medusa', id: product.id }],
    title: product.title,
    description: product.description ?? undefined,
    handle: product.handle,
    status: medusaStatusToIntegrax(product.status),
    variants: product.variants.map(medusaVariantToVariant),
    tags: product.tags?.map(t => t.value),
    collectionId: product.collection_id ?? undefined,
    metadata: product.metadata ?? undefined,
    createdAt: new Date(product.created_at),
    updatedAt: new Date(product.updated_at),
  };
}

function medusaStatusToIntegrax(status: string): CatalogItem['status'] {
  if (status === 'published') return 'published';
  if (status === 'draft' || status === 'proposed') return 'draft';
  return 'archived';
}

function medusaVariantToVariant(variant: MedusaVariant): Variant {
  return {
    id: variant.id,
    catalogItemId: variant.product_id,
    sku: variant.sku ?? `${variant.product_id}-${variant.id}`,
    title: variant.title,
    prices: variant.prices.map(medusaMoneyToPrice),
    inventory_quantity: variant.inventory_quantity,
    allow_backorder: variant.allow_backorder,
    metadata: variant.metadata ?? undefined,
  };
}

function medusaMoneyToPrice(money: MedusaMoneyAmount): Price {
  return {
    id: money.id,
    variantId: money.variant_id,
    currency: money.currency_code,
    amount: money.amount,
    listId: money.price_list_id ?? undefined,
    startsAt: money.starts_at ? new Date(money.starts_at) : undefined,
    endsAt: money.ends_at ? new Date(money.ends_at) : undefined,
  };
}

export function catalogItemToMedusaProduct(item: CatalogItem): Partial<MedusaProduct> {
  return {
    title: item.title,
    handle: item.handle,
    description: item.description,
    status: item.status === 'published' ? 'published' : 'draft',
    tags: item.tags?.map(v => ({ id: v, value: v })),
    collection_id: item.collectionId,
    metadata: item.metadata,
  };
}
