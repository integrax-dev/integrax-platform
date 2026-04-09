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

// Medusa adapter — only import when needed
export { MedusaAdapter, createMedusaAdapter, MedusaAdapterNotConfiguredError } from './medusa-adapter/adapter.js';
export type { MedusaAdapterConfig } from './medusa-adapter/adapter.js';
