export { EcommerceService } from './ecommerce-service.js';
export { moduleManifest } from './module.manifest.js';
export type {
  CatalogItem,
  Variant,
  Price,
  PriceList,
  SalesChannel,
  Cart,
  LineItem,
  Address,
  CheckoutSession,
  Discount,
  DiscountRule,
  DiscountCondition,
  CustomerAccount,
  DraftOrder,
  FulfillmentRequest,
  ReturnRequest,
  InventoryAllocation,
} from './types.js';

// Adapter interface
export type { EcommerceAdapter } from './adapter.js';

// Medusa adapter
export { MedusaAdapter, createMedusaAdapter, MedusaAdapterNotConfiguredError } from './medusa-adapter/adapter.js';
export type { MedusaAdapterConfig } from './medusa-adapter/adapter.js';

// Tiendanube adapter
export { TiendanubeAdapter, createTiendanubeAdapter } from './tiendanube-adapter/adapter.js';
export type { TiendanubeAdapterConfig } from './tiendanube-adapter/adapter.js';

// Shopify adapter
export { ShopifyAdapter, createShopifyAdapter } from './shopify-adapter/adapter.js';
export type { ShopifyAdapterConfig } from './shopify-adapter/adapter.js';

// VTEX adapter
export { VTEXAdapter, createVTEXAdapter } from './vtex-adapter/adapter.js';
export type { VTEXAdapterConfig } from './vtex-adapter/adapter.js';

// WooCommerce adapter
export { WooCommerceAdapter, createWooCommerceAdapter } from './woocommerce-adapter/adapter.js';
export type { WooCommerceAdapterConfig } from './woocommerce-adapter/adapter.js';
