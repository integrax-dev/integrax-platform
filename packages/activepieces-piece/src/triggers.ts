import type { NodeDefinition } from './types.js';

export const TRIGGERS: NodeDefinition[] = [
  // ─── Orders ────────────────────────────────────────────────────────────────
  {
    id: 'trigger.order.created',
    name: 'Order Created',
    category: 'trigger',
    eventType: 'order.created',
    description: 'Fires when a new order is created in any connected system.',
    inputFields: [],
    outputFields: [
      { name: 'orderId', label: 'Order ID', type: 'string', required: true },
      { name: 'status', label: 'Status', type: 'string', required: true },
      { name: 'tenantId', label: 'Tenant ID', type: 'string', required: true },
      { name: 'payload', label: 'Order Payload', type: 'object', required: true },
    ],
  },
  {
    id: 'trigger.order.updated',
    name: 'Order Updated',
    category: 'trigger',
    eventType: 'order.updated',
    description: 'Fires when an order is modified.',
    inputFields: [],
    outputFields: [
      { name: 'orderId', label: 'Order ID', type: 'string', required: true },
      { name: 'payload', label: 'Updated Order', type: 'object', required: true },
    ],
  },
  {
    id: 'trigger.order.status_changed',
    name: 'Order Status Changed',
    category: 'trigger',
    eventType: 'order.status_changed',
    description: 'Fires when an order transitions to a new lifecycle status.',
    inputFields: [
      { name: 'filterStatus', label: 'Filter by Status', type: 'string', required: false, description: 'Only fire for this status. Leave empty for all.' },
    ],
    outputFields: [
      { name: 'orderId', label: 'Order ID', type: 'string', required: true },
      { name: 'newStatus', label: 'New Status', type: 'string', required: true },
      { name: 'previousStatus', label: 'Previous Status', type: 'string', required: false },
    ],
  },
  {
    id: 'trigger.order.cancelled',
    name: 'Order Cancelled',
    category: 'trigger',
    eventType: 'order.cancelled',
    description: 'Fires when an order is cancelled.',
    inputFields: [],
    outputFields: [
      { name: 'orderId', label: 'Order ID', type: 'string', required: true },
      { name: 'payload', label: 'Payload', type: 'object', required: true },
    ],
  },

  // ─── Products ──────────────────────────────────────────────────────────────
  {
    id: 'trigger.product.created',
    name: 'Product Created',
    category: 'trigger',
    eventType: 'product.created',
    description: 'Fires when a new product is added to the catalog.',
    inputFields: [],
    outputFields: [
      { name: 'sku', label: 'SKU', type: 'string', required: true },
      { name: 'payload', label: 'Product Payload', type: 'object', required: true },
    ],
  },
  {
    id: 'trigger.product.updated',
    name: 'Product Updated',
    category: 'trigger',
    eventType: 'product.updated',
    description: 'Fires when a product is modified.',
    inputFields: [],
    outputFields: [
      { name: 'sku', label: 'SKU', type: 'string', required: true },
      { name: 'payload', label: 'Updated Product', type: 'object', required: true },
    ],
  },
  {
    id: 'trigger.product.price_changed',
    name: 'Product Price Changed',
    category: 'trigger',
    eventType: 'product.price_changed',
    description: 'Fires when the price of a product changes.',
    inputFields: [],
    outputFields: [
      { name: 'sku', label: 'SKU', type: 'string', required: true },
      { name: 'newPrice', label: 'New Price', type: 'number', required: true },
      { name: 'currency', label: 'Currency', type: 'string', required: true },
    ],
  },
  {
    id: 'trigger.product.archived',
    name: 'Product Archived',
    category: 'trigger',
    eventType: 'product.archived',
    description: 'Fires when a product is archived.',
    inputFields: [],
    outputFields: [
      { name: 'sku', label: 'SKU', type: 'string', required: true },
    ],
  },

  // ─── Stock ─────────────────────────────────────────────────────────────────
  {
    id: 'trigger.stock.changed',
    name: 'Stock Changed',
    category: 'trigger',
    eventType: 'stock.changed',
    description: 'Fires when stock quantity changes for any SKU.',
    inputFields: [],
    outputFields: [
      { name: 'sku', label: 'SKU', type: 'string', required: true },
      { name: 'newQuantity', label: 'New Quantity', type: 'number', required: true },
      { name: 'delta', label: 'Delta', type: 'number', required: false },
    ],
  },
  {
    id: 'trigger.stock.diverged',
    name: 'Stock Diverged',
    category: 'trigger',
    eventType: 'stock.diverged',
    description: 'Fires when stock diverges across connected systems.',
    inputFields: [],
    outputFields: [
      { name: 'sku', label: 'SKU', type: 'string', required: true },
      { name: 'systems', label: 'Diverged Systems', type: 'array', required: true },
    ],
  },
  {
    id: 'trigger.stock.depleted',
    name: 'Stock Depleted',
    category: 'trigger',
    eventType: 'stock.depleted',
    description: 'Fires when stock reaches zero.',
    inputFields: [],
    outputFields: [
      { name: 'sku', label: 'SKU', type: 'string', required: true },
    ],
  },

  // ─── Invoices ──────────────────────────────────────────────────────────────
  {
    id: 'trigger.invoice.created',
    name: 'Invoice Created',
    category: 'trigger',
    eventType: 'invoice.created',
    description: 'Fires when an invoice is generated.',
    inputFields: [],
    outputFields: [
      { name: 'invoiceNumber', label: 'Invoice Number', type: 'string', required: true },
      { name: 'payload', label: 'Invoice Payload', type: 'object', required: true },
    ],
  },
  {
    id: 'trigger.invoice.authorized',
    name: 'Invoice Authorized',
    category: 'trigger',
    eventType: 'invoice.authorized',
    description: 'Fires when an invoice receives CAE/fiscal authorization.',
    inputFields: [],
    outputFields: [
      { name: 'invoiceNumber', label: 'Invoice Number', type: 'string', required: true },
      { name: 'cae', label: 'CAE', type: 'string', required: false },
    ],
  },
  {
    id: 'trigger.invoice.failed',
    name: 'Invoice Failed',
    category: 'trigger',
    eventType: 'invoice.failed',
    description: 'Fires when invoice authorization fails.',
    inputFields: [],
    outputFields: [
      { name: 'invoiceNumber', label: 'Invoice Number', type: 'string', required: false },
      { name: 'error', label: 'Error', type: 'string', required: true },
    ],
  },
  {
    id: 'trigger.invoice.voided',
    name: 'Invoice Voided',
    category: 'trigger',
    eventType: 'invoice.voided',
    description: 'Fires when an invoice is voided/cancelled.',
    inputFields: [],
    outputFields: [
      { name: 'invoiceNumber', label: 'Invoice Number', type: 'string', required: true },
    ],
  },

  // ─── Customers ─────────────────────────────────────────────────────────────
  {
    id: 'trigger.customer.created',
    name: 'Customer Created',
    category: 'trigger',
    eventType: 'customer.created',
    description: 'Fires when a new customer is registered.',
    inputFields: [],
    outputFields: [
      { name: 'customerId', label: 'Customer ID', type: 'string', required: true },
      { name: 'payload', label: 'Customer Payload', type: 'object', required: true },
    ],
  },
  {
    id: 'trigger.customer.updated',
    name: 'Customer Updated',
    category: 'trigger',
    eventType: 'customer.updated',
    description: 'Fires when customer data is updated.',
    inputFields: [],
    outputFields: [
      { name: 'customerId', label: 'Customer ID', type: 'string', required: true },
      { name: 'payload', label: 'Updated Customer', type: 'object', required: true },
    ],
  },

  // ─── Payments ──────────────────────────────────────────────────────────────
  {
    id: 'trigger.payment.created',
    name: 'Payment Created',
    category: 'trigger',
    eventType: 'payment.created',
    description: 'Fires when a new payment is initiated.',
    inputFields: [],
    outputFields: [
      { name: 'paymentId', label: 'Payment ID', type: 'string', required: true },
      { name: 'amount', label: 'Amount', type: 'number', required: true },
      { name: 'currency', label: 'Currency', type: 'string', required: true },
    ],
  },
  {
    id: 'trigger.payment.authorized',
    name: 'Payment Authorized',
    category: 'trigger',
    eventType: 'payment.authorized',
    description: 'Fires when a payment is authorized (funds held).',
    inputFields: [],
    outputFields: [
      { name: 'paymentId', label: 'Payment ID', type: 'string', required: true },
      { name: 'amount', label: 'Amount', type: 'number', required: true },
    ],
  },
  {
    id: 'trigger.payment.captured',
    name: 'Payment Captured',
    category: 'trigger',
    eventType: 'payment.captured',
    description: 'Fires when a payment is captured (funds collected).',
    inputFields: [],
    outputFields: [
      { name: 'paymentId', label: 'Payment ID', type: 'string', required: true },
      { name: 'amount', label: 'Amount', type: 'number', required: true },
    ],
  },
  {
    id: 'trigger.payment.failed',
    name: 'Payment Failed',
    category: 'trigger',
    eventType: 'payment.failed',
    description: 'Fires when a payment fails or is rejected.',
    inputFields: [],
    outputFields: [
      { name: 'paymentId', label: 'Payment ID', type: 'string', required: true },
      { name: 'reason', label: 'Failure Reason', type: 'string', required: false },
    ],
  },
  {
    id: 'trigger.payment.refunded',
    name: 'Payment Refunded',
    category: 'trigger',
    eventType: 'payment.refunded',
    description: 'Fires when a full refund is issued.',
    inputFields: [],
    outputFields: [
      { name: 'paymentId', label: 'Payment ID', type: 'string', required: true },
      { name: 'refundAmount', label: 'Refund Amount', type: 'number', required: true },
    ],
  },
  {
    id: 'trigger.payment.chargeback',
    name: 'Chargeback Received',
    category: 'trigger',
    eventType: 'payment.chargeback',
    description: 'Fires when a chargeback is received from the PSP.',
    inputFields: [],
    outputFields: [
      { name: 'paymentId', label: 'Payment ID', type: 'string', required: true },
    ],
  },

  // ─── Shipments ─────────────────────────────────────────────────────────────
  {
    id: 'trigger.shipment.created',
    name: 'Shipment Created',
    category: 'trigger',
    eventType: 'shipment.created',
    description: 'Fires when a shipment is created.',
    inputFields: [],
    outputFields: [
      { name: 'trackingId', label: 'Tracking ID', type: 'string', required: false },
      { name: 'payload', label: 'Shipment Payload', type: 'object', required: true },
    ],
  },
  {
    id: 'trigger.shipment.status_changed',
    name: 'Shipment Status Changed',
    category: 'trigger',
    eventType: 'shipment.status_changed',
    description: 'Fires when a shipment status updates.',
    inputFields: [],
    outputFields: [
      { name: 'trackingId', label: 'Tracking ID', type: 'string', required: false },
      { name: 'newStatus', label: 'New Status', type: 'string', required: true },
    ],
  },
  {
    id: 'trigger.shipment.delivered',
    name: 'Shipment Delivered',
    category: 'trigger',
    eventType: 'shipment.delivered',
    description: 'Fires when a shipment is marked as delivered.',
    inputFields: [],
    outputFields: [
      { name: 'trackingId', label: 'Tracking ID', type: 'string', required: false },
    ],
  },

  // ─── Conflicts ─────────────────────────────────────────────────────────────
  {
    id: 'trigger.conflict.detected',
    name: 'Conflict Detected',
    category: 'trigger',
    eventType: 'conflict.detected',
    description: 'Fires when IntegraX detects a data inconsistency between systems.',
    inputFields: [
      { name: 'filterEntityType', label: 'Filter by Entity Type', type: 'string', required: false },
    ],
    outputFields: [
      { name: 'entityType', label: 'Entity Type', type: 'string', required: true },
      { name: 'entityId', label: 'Entity ID', type: 'string', required: false },
      { name: 'conflicts', label: 'Conflicts', type: 'array', required: true },
    ],
  },
  {
    id: 'trigger.conflict.resolved',
    name: 'Conflict Resolved',
    category: 'trigger',
    eventType: 'conflict.resolved',
    description: 'Fires when a conflict is resolved.',
    inputFields: [],
    outputFields: [
      { name: 'entityType', label: 'Entity Type', type: 'string', required: true },
      { name: 'entityId', label: 'Entity ID', type: 'string', required: false },
    ],
  },

  // ─── Operations ────────────────────────────────────────────────────────────
  {
    id: 'trigger.operation.approval_required',
    name: 'Approval Required',
    category: 'trigger',
    eventType: 'operation.approval_required',
    description: 'Fires when an operation is waiting for manual approval.',
    inputFields: [],
    outputFields: [
      { name: 'operationId', label: 'Operation ID', type: 'string', required: true },
      { name: 'commandName', label: 'Command', type: 'string', required: true },
      { name: 'payload', label: 'Operation Payload', type: 'object', required: true },
    ],
  },
  {
    id: 'trigger.operation.succeeded',
    name: 'Operation Succeeded',
    category: 'trigger',
    eventType: 'operation.succeeded',
    description: 'Fires when an operation completes successfully.',
    inputFields: [],
    outputFields: [
      { name: 'operationId', label: 'Operation ID', type: 'string', required: true },
      { name: 'commandName', label: 'Command', type: 'string', required: true },
      { name: 'result', label: 'Result', type: 'object', required: false },
    ],
  },
  {
    id: 'trigger.operation.failed',
    name: 'Operation Failed',
    category: 'trigger',
    eventType: 'operation.failed',
    description: 'Fires when an operation fails.',
    inputFields: [],
    outputFields: [
      { name: 'operationId', label: 'Operation ID', type: 'string', required: true },
      { name: 'commandName', label: 'Command', type: 'string', required: true },
      { name: 'error', label: 'Error', type: 'string', required: true },
    ],
  },

  // ─── Subscriptions ─────────────────────────────────────────────────────────
  {
    id: 'trigger.subscription.created',
    name: 'Subscription Created',
    category: 'trigger',
    eventType: 'subscription.created',
    description: 'Fires when a recurring billing subscription is created.',
    inputFields: [],
    outputFields: [
      { name: 'subscriptionId', label: 'Subscription ID', type: 'string', required: true },
      { name: 'payload', label: 'Subscription Payload', type: 'object', required: true },
    ],
  },
  {
    id: 'trigger.subscription.past_due',
    name: 'Subscription Past Due',
    category: 'trigger',
    eventType: 'subscription.past_due',
    description: 'Fires when a subscription payment is overdue.',
    inputFields: [],
    outputFields: [
      { name: 'subscriptionId', label: 'Subscription ID', type: 'string', required: true },
    ],
  },
  {
    id: 'trigger.subscription.cancelled',
    name: 'Subscription Cancelled',
    category: 'trigger',
    eventType: 'subscription.cancelled',
    description: 'Fires when a subscription is cancelled.',
    inputFields: [],
    outputFields: [
      { name: 'subscriptionId', label: 'Subscription ID', type: 'string', required: true },
    ],
  },
  {
    id: 'trigger.subscription.expired',
    name: 'Subscription Expired',
    category: 'trigger',
    eventType: 'subscription.expired',
    description: 'Fires when a subscription expires.',
    inputFields: [],
    outputFields: [
      { name: 'subscriptionId', label: 'Subscription ID', type: 'string', required: true },
    ],
  },

  // ─── Reconciliation ────────────────────────────────────────────────────────
  {
    id: 'trigger.reconciliation.conflict.detected',
    name: 'Reconciliation Conflict',
    category: 'trigger',
    eventType: 'reconciliation.conflict.detected',
    description: 'Fires when reconciliation finds a mismatch.',
    inputFields: [],
    outputFields: [
      { name: 'entityType', label: 'Entity Type', type: 'string', required: true },
      { name: 'conflicts', label: 'Conflicts', type: 'array', required: true },
    ],
  },
  {
    id: 'trigger.reconciliation.clean',
    name: 'Reconciliation Clean',
    category: 'trigger',
    eventType: 'reconciliation.clean',
    description: 'Fires when reconciliation confirms systems are in sync.',
    inputFields: [],
    outputFields: [
      { name: 'entityType', label: 'Entity Type', type: 'string', required: true },
    ],
  },

  // ─── Webhook passthrough ───────────────────────────────────────────────────
  {
    id: 'trigger.webhook.received',
    name: 'Webhook Received',
    category: 'trigger',
    eventType: 'webhook.received',
    description: 'Fires when an external webhook is received by IntegraX.',
    inputFields: [
      { name: 'filterConnectorId', label: 'Filter by Connector', type: 'string', required: false },
    ],
    outputFields: [
      { name: 'connectorId', label: 'Connector ID', type: 'string', required: true },
      { name: 'rawPayload', label: 'Raw Payload', type: 'object', required: true },
    ],
  },
];
