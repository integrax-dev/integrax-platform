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
