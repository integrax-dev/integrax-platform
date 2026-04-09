// --- Utilidades -------------------------------------------------------------
export { ulid } from './ulid.js';

// --- Primitiva compartida ---------------------------------------------------
export type { ExternalId } from './external-id.js';

// --- Entidades canonicas ----------------------------------------------------
export type { Product, ProductStatus } from './product.js';
export type { Customer, CustomerStatus, CustomerAddress, VatStatus } from './customer.js';
export type { Invoice, InvoiceStatus } from './invoice.js';
export type { Order, OrderStatus, OrderItem, OrderAmounts } from './order.js';
export type { Stock } from './stock.js';
export type { Shipment, ShipmentStatus } from './shipment.js';
export type { Transaction, TransactionStatus, TransactionType } from './transaction.js';
export type { Document } from './document.js';
export type { Payment, PaymentStatus, PaymentMethodType } from './payment.js';
export type { PaymentMethod } from './payment-method.js';
export type { Subscription, SubscriptionStatus, BillingFrequency } from './subscription.js';
export type { Refund, RefundStatus, RefundReason } from './refund.js';

// --- Payment provider matrix ------------------------------------------------
export {
  PAYMENT_PROVIDER_MATRIX,
  getProviderMatrix,
  getProvidersForCapability,
  getCapabilityStatus,
} from './payment-provider-matrix.js';
export type {
  CapabilityStatus,
  PaymentCapabilityKey,
  ProviderCapabilityEntry,
  ProviderCapabilityRow,
  ProviderMatrixEntry,
} from './payment-provider-matrix.js';
