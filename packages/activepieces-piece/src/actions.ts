import type { NodeDefinition } from './types.js';

export const ACTIONS: NodeDefinition[] = [
  // ─── Invoicing ─────────────────────────────────────────────────────────────
  {
    id: 'action.issue_invoice',
    name: 'Issue Invoice',
    category: 'action',
    commandName: 'issue_invoice',
    description: 'Generate and authorize a fiscal invoice via the configured fiscal connector (AFIP, etc.).',
    inputFields: [
      { name: 'tenantId', label: 'Tenant ID', type: 'string', required: true },
      { name: 'connectorId', label: 'Connector ID', type: 'string', required: true, description: 'e.g. afip-wsfe' },
      { name: 'invoiceData', label: 'Invoice Data', type: 'object', required: true },
      { name: 'idempotencyKey', label: 'Idempotency Key', type: 'string', required: false },
    ],
    outputFields: [
      { name: 'operationId', label: 'Operation ID', type: 'string', required: true },
      { name: 'status', label: 'Status', type: 'string', required: true },
      { name: 'invoiceNumber', label: 'Invoice Number', type: 'string', required: false },
      { name: 'cae', label: 'CAE', type: 'string', required: false },
    ],
  },
  {
    id: 'action.approve_document',
    name: 'Approve Document',
    category: 'action',
    commandName: 'approve_document',
    description: 'Submit a pending document to the external system for approval.',
    inputFields: [
      { name: 'tenantId', label: 'Tenant ID', type: 'string', required: true },
      { name: 'connectorId', label: 'Connector ID', type: 'string', required: true },
      { name: 'documentId', label: 'Document ID', type: 'string', required: true },
    ],
    outputFields: [
      { name: 'operationId', label: 'Operation ID', type: 'string', required: true },
      { name: 'status', label: 'Status', type: 'string', required: true },
    ],
  },

  // ─── Catalog ───────────────────────────────────────────────────────────────
  {
    id: 'action.publish_catalog_item',
    name: 'Publish Product',
    category: 'action',
    commandName: 'publish_catalog_item',
    description: 'Publish a product to all configured channels (Tiendanube, WooCommerce, etc.).',
    inputFields: [
      { name: 'tenantId', label: 'Tenant ID', type: 'string', required: true },
      { name: 'sku', label: 'SKU', type: 'string', required: true },
      { name: 'productData', label: 'Product Data', type: 'object', required: true },
    ],
    outputFields: [
      { name: 'operationId', label: 'Operation ID', type: 'string', required: true },
      { name: 'status', label: 'Status', type: 'string', required: true },
    ],
  },
  {
    id: 'action.archive_catalog_item',
    name: 'Archive Product',
    category: 'action',
    commandName: 'archive_catalog_item',
    description: 'Archive a product across all connected channels.',
    inputFields: [
      { name: 'tenantId', label: 'Tenant ID', type: 'string', required: true },
      { name: 'sku', label: 'SKU', type: 'string', required: true },
    ],
    outputFields: [
      { name: 'operationId', label: 'Operation ID', type: 'string', required: true },
      { name: 'status', label: 'Status', type: 'string', required: true },
    ],
  },
  {
    id: 'action.ingest_catalog_item',
    name: 'Ingest Catalog Item',
    category: 'action',
    commandName: 'ingest_catalog_item',
    description: 'Ingest a product into the IntegraX snapshot store.',
    inputFields: [
      { name: 'tenantId', label: 'Tenant ID', type: 'string', required: true },
      { name: 'item', label: 'Catalog Item', type: 'object', required: true },
    ],
    outputFields: [
      { name: 'operationId', label: 'Operation ID', type: 'string', required: true },
      { name: 'status', label: 'Status', type: 'string', required: true },
    ],
  },

  // ─── Inventory ─────────────────────────────────────────────────────────────
  {
    id: 'action.update_stock',
    name: 'Update Stock',
    category: 'action',
    commandName: 'update_record',
    description: 'Update stock quantity for a SKU in the target system.',
    inputFields: [
      { name: 'tenantId', label: 'Tenant ID', type: 'string', required: true },
      { name: 'connectorId', label: 'Connector ID', type: 'string', required: true },
      { name: 'sku', label: 'SKU', type: 'string', required: true },
      { name: 'quantity', label: 'Quantity', type: 'number', required: true },
      { name: 'location', label: 'Location', type: 'string', required: false },
    ],
    outputFields: [
      { name: 'operationId', label: 'Operation ID', type: 'string', required: true },
      { name: 'status', label: 'Status', type: 'string', required: true },
    ],
  },
  {
    id: 'action.sync_record',
    name: 'Sync Record',
    category: 'action',
    commandName: 'sync_record',
    description: 'Pull latest state of a remote record into the IntegraX snapshot store.',
    inputFields: [
      { name: 'tenantId', label: 'Tenant ID', type: 'string', required: true },
      { name: 'connectorId', label: 'Connector ID', type: 'string', required: true },
      { name: 'entityType', label: 'Entity Type', type: 'string', required: true },
      { name: 'entityId', label: 'Entity ID', type: 'string', required: true },
    ],
    outputFields: [
      { name: 'operationId', label: 'Operation ID', type: 'string', required: true },
      { name: 'status', label: 'Status', type: 'string', required: true },
      { name: 'snapshot', label: 'Snapshot', type: 'object', required: false },
    ],
  },

  // ─── Orders ────────────────────────────────────────────────────────────────
  {
    id: 'action.change_order_status',
    name: 'Change Order Status',
    category: 'action',
    commandName: 'change_order_status',
    description: 'Transition an order to a new lifecycle status.',
    inputFields: [
      { name: 'tenantId', label: 'Tenant ID', type: 'string', required: true },
      { name: 'orderId', label: 'Order ID', type: 'string', required: true },
      { name: 'newStatus', label: 'New Status', type: 'string', required: true },
    ],
    outputFields: [
      { name: 'operationId', label: 'Operation ID', type: 'string', required: true },
      { name: 'status', label: 'Status', type: 'string', required: true },
    ],
  },
  {
    id: 'action.start_checkout',
    name: 'Start Checkout',
    category: 'action',
    commandName: 'start_checkout',
    description: 'Start a checkout session for a cart.',
    inputFields: [
      { name: 'tenantId', label: 'Tenant ID', type: 'string', required: true },
      { name: 'cartId', label: 'Cart ID', type: 'string', required: true },
    ],
    outputFields: [
      { name: 'operationId', label: 'Operation ID', type: 'string', required: true },
      { name: 'checkoutUrl', label: 'Checkout URL', type: 'string', required: false },
    ],
  },
  {
    id: 'action.request_fulfillment',
    name: 'Request Fulfillment',
    category: 'action',
    commandName: 'request_fulfillment',
    description: 'Request fulfillment for a placed order.',
    inputFields: [
      { name: 'tenantId', label: 'Tenant ID', type: 'string', required: true },
      { name: 'orderId', label: 'Order ID', type: 'string', required: true },
      { name: 'fulfillmentData', label: 'Fulfillment Data', type: 'object', required: false },
    ],
    outputFields: [
      { name: 'operationId', label: 'Operation ID', type: 'string', required: true },
      { name: 'status', label: 'Status', type: 'string', required: true },
    ],
  },

  // ─── Payments ──────────────────────────────────────────────────────────────
  {
    id: 'action.create_payment',
    name: 'Create Payment',
    category: 'action',
    commandName: 'create_payment',
    description: 'Initiate a new payment through the configured PSP.',
    inputFields: [
      { name: 'tenantId', label: 'Tenant ID', type: 'string', required: true },
      { name: 'connectorId', label: 'PSP Connector ID', type: 'string', required: true, description: 'e.g. mercadopago, payway, mobbex' },
      { name: 'amount', label: 'Amount', type: 'number', required: true },
      { name: 'currency', label: 'Currency', type: 'string', required: true, default: 'ARS' },
      { name: 'description', label: 'Description', type: 'string', required: false },
      { name: 'paymentData', label: 'Payment Data', type: 'object', required: true },
      { name: 'idempotencyKey', label: 'Idempotency Key', type: 'string', required: false },
    ],
    outputFields: [
      { name: 'operationId', label: 'Operation ID', type: 'string', required: true },
      { name: 'paymentId', label: 'Payment ID', type: 'string', required: false },
      { name: 'status', label: 'Status', type: 'string', required: true },
    ],
  },
  {
    id: 'action.authorize_payment',
    name: 'Authorize Payment',
    category: 'action',
    commandName: 'authorize_payment',
    description: 'Authorize (hold) funds without capturing them.',
    inputFields: [
      { name: 'tenantId', label: 'Tenant ID', type: 'string', required: true },
      { name: 'connectorId', label: 'PSP Connector ID', type: 'string', required: true },
      { name: 'amount', label: 'Amount', type: 'number', required: true },
      { name: 'currency', label: 'Currency', type: 'string', required: true },
      { name: 'paymentData', label: 'Payment Data', type: 'object', required: true },
    ],
    outputFields: [
      { name: 'operationId', label: 'Operation ID', type: 'string', required: true },
      { name: 'status', label: 'Status', type: 'string', required: true },
    ],
  },
  {
    id: 'action.capture_payment',
    name: 'Capture Payment',
    category: 'action',
    commandName: 'capture_payment',
    description: 'Capture a previously authorized payment.',
    inputFields: [
      { name: 'tenantId', label: 'Tenant ID', type: 'string', required: true },
      { name: 'connectorId', label: 'PSP Connector ID', type: 'string', required: true },
      { name: 'paymentId', label: 'Payment ID', type: 'string', required: true },
      { name: 'amount', label: 'Amount (partial capture)', type: 'number', required: false },
    ],
    outputFields: [
      { name: 'operationId', label: 'Operation ID', type: 'string', required: true },
      { name: 'status', label: 'Status', type: 'string', required: true },
    ],
  },
  {
    id: 'action.refund_payment',
    name: 'Refund Payment',
    category: 'action',
    commandName: 'refund_payment',
    description: 'Issue a full or partial refund.',
    inputFields: [
      { name: 'tenantId', label: 'Tenant ID', type: 'string', required: true },
      { name: 'connectorId', label: 'PSP Connector ID', type: 'string', required: true },
      { name: 'paymentId', label: 'Payment ID', type: 'string', required: true },
      { name: 'amount', label: 'Refund Amount (blank = full)', type: 'number', required: false },
      { name: 'reason', label: 'Reason', type: 'string', required: false },
    ],
    outputFields: [
      { name: 'operationId', label: 'Operation ID', type: 'string', required: true },
      { name: 'status', label: 'Status', type: 'string', required: true },
    ],
  },
  {
    id: 'action.cancel_payment',
    name: 'Cancel Payment',
    category: 'action',
    commandName: 'cancel_payment',
    description: 'Void a pending or authorized payment.',
    inputFields: [
      { name: 'tenantId', label: 'Tenant ID', type: 'string', required: true },
      { name: 'connectorId', label: 'PSP Connector ID', type: 'string', required: true },
      { name: 'paymentId', label: 'Payment ID', type: 'string', required: true },
    ],
    outputFields: [
      { name: 'operationId', label: 'Operation ID', type: 'string', required: true },
      { name: 'status', label: 'Status', type: 'string', required: true },
    ],
  },
  {
    id: 'action.create_checkout_link',
    name: 'Create Checkout Link',
    category: 'action',
    commandName: 'create_checkout_link',
    description: 'Generate a hosted payment link or checkout URL.',
    inputFields: [
      { name: 'tenantId', label: 'Tenant ID', type: 'string', required: true },
      { name: 'connectorId', label: 'PSP Connector ID', type: 'string', required: true },
      { name: 'amount', label: 'Amount', type: 'number', required: true },
      { name: 'currency', label: 'Currency', type: 'string', required: true },
      { name: 'description', label: 'Description', type: 'string', required: false },
      { name: 'expiresAt', label: 'Expires At (ISO-8601)', type: 'string', required: false },
    ],
    outputFields: [
      { name: 'operationId', label: 'Operation ID', type: 'string', required: true },
      { name: 'checkoutUrl', label: 'Checkout URL', type: 'string', required: false },
      { name: 'status', label: 'Status', type: 'string', required: true },
    ],
  },
  {
    id: 'action.generate_qr_payment',
    name: 'Generate QR Payment',
    category: 'action',
    commandName: 'generate_qr_payment',
    description: 'Create a QR code payment request (MercadoPago, etc.).',
    inputFields: [
      { name: 'tenantId', label: 'Tenant ID', type: 'string', required: true },
      { name: 'connectorId', label: 'PSP Connector ID', type: 'string', required: true },
      { name: 'amount', label: 'Amount', type: 'number', required: true },
      { name: 'currency', label: 'Currency', type: 'string', required: true },
      { name: 'description', label: 'Description', type: 'string', required: false },
    ],
    outputFields: [
      { name: 'operationId', label: 'Operation ID', type: 'string', required: true },
      { name: 'qrData', label: 'QR Data', type: 'string', required: false },
      { name: 'qrImage', label: 'QR Image URL', type: 'string', required: false },
    ],
  },
  {
    id: 'action.tokenize_payment_method',
    name: 'Tokenize Payment Method',
    category: 'action',
    commandName: 'tokenize_payment_method',
    description: 'Store a payment instrument as a reusable PSP token.',
    inputFields: [
      { name: 'tenantId', label: 'Tenant ID', type: 'string', required: true },
      { name: 'connectorId', label: 'PSP Connector ID', type: 'string', required: true },
      { name: 'paymentMethodData', label: 'Payment Method Data', type: 'object', required: true },
    ],
    outputFields: [
      { name: 'operationId', label: 'Operation ID', type: 'string', required: true },
      { name: 'token', label: 'Token', type: 'string', required: false },
      { name: 'status', label: 'Status', type: 'string', required: true },
    ],
  },
  {
    id: 'action.create_subscription',
    name: 'Create Subscription',
    category: 'action',
    commandName: 'create_subscription',
    description: 'Set up a recurring billing agreement.',
    inputFields: [
      { name: 'tenantId', label: 'Tenant ID', type: 'string', required: true },
      { name: 'connectorId', label: 'PSP Connector ID', type: 'string', required: true },
      { name: 'subscriptionData', label: 'Subscription Data', type: 'object', required: true },
    ],
    outputFields: [
      { name: 'operationId', label: 'Operation ID', type: 'string', required: true },
      { name: 'subscriptionId', label: 'Subscription ID', type: 'string', required: false },
      { name: 'status', label: 'Status', type: 'string', required: true },
    ],
  },
  {
    id: 'action.cancel_subscription',
    name: 'Cancel Subscription',
    category: 'action',
    commandName: 'cancel_subscription',
    description: 'Terminate a recurring billing agreement.',
    inputFields: [
      { name: 'tenantId', label: 'Tenant ID', type: 'string', required: true },
      { name: 'connectorId', label: 'PSP Connector ID', type: 'string', required: true },
      { name: 'subscriptionId', label: 'Subscription ID', type: 'string', required: true },
    ],
    outputFields: [
      { name: 'operationId', label: 'Operation ID', type: 'string', required: true },
      { name: 'status', label: 'Status', type: 'string', required: true },
    ],
  },
  {
    id: 'action.reconcile_payment',
    name: 'Reconcile Payment',
    category: 'action',
    commandName: 'reconcile_payment',
    description: 'Reconcile canonical payment state against live PSP state.',
    inputFields: [
      { name: 'tenantId', label: 'Tenant ID', type: 'string', required: true },
      { name: 'connectorId', label: 'PSP Connector ID', type: 'string', required: true },
      { name: 'paymentId', label: 'Payment ID', type: 'string', required: true },
    ],
    outputFields: [
      { name: 'operationId', label: 'Operation ID', type: 'string', required: true },
      { name: 'hasAnomaly', label: 'Has Anomaly', type: 'boolean', required: true },
      { name: 'anomalies', label: 'Anomalies', type: 'array', required: false },
    ],
  },
  {
    id: 'action.send_payment_reminder',
    name: 'Send Payment Reminder',
    category: 'action',
    commandName: 'send_payment_reminder',
    description: 'Send a payment reminder to a payer via email, WhatsApp, or SMS.',
    inputFields: [
      { name: 'tenantId', label: 'Tenant ID', type: 'string', required: true },
      { name: 'paymentId', label: 'Payment ID', type: 'string', required: true },
      { name: 'channel', label: 'Channel', type: 'enum', required: true, enumValues: ['email', 'whatsapp', 'sms'] },
    ],
    outputFields: [
      { name: 'operationId', label: 'Operation ID', type: 'string', required: true },
      { name: 'status', label: 'Status', type: 'string', required: true },
    ],
  },

  // ─── Notifications ─────────────────────────────────────────────────────────
  {
    id: 'action.send_notification',
    name: 'Send Notification',
    category: 'action',
    commandName: 'send_notification',
    description: 'Send a notification via email, WhatsApp, or other channel.',
    inputFields: [
      { name: 'tenantId', label: 'Tenant ID', type: 'string', required: true },
      { name: 'connectorId', label: 'Connector ID', type: 'string', required: true, description: 'e.g. email, whatsapp' },
      { name: 'recipient', label: 'Recipient', type: 'string', required: true },
      { name: 'subject', label: 'Subject', type: 'string', required: false },
      { name: 'body', label: 'Message Body', type: 'string', required: true },
      { name: 'templateId', label: 'Template ID', type: 'string', required: false },
    ],
    outputFields: [
      { name: 'operationId', label: 'Operation ID', type: 'string', required: true },
      { name: 'status', label: 'Status', type: 'string', required: true },
    ],
  },

  // ─── Conflict resolution ───────────────────────────────────────────────────
  {
    id: 'action.resolve_conflict',
    name: 'Resolve Conflict',
    category: 'action',
    commandName: 'resolve_conflict',
    description: 'Mark a detected conflict as resolved and apply the winning value.',
    inputFields: [
      { name: 'tenantId', label: 'Tenant ID', type: 'string', required: true },
      { name: 'entityType', label: 'Entity Type', type: 'string', required: true },
      { name: 'entityId', label: 'Entity ID', type: 'string', required: true },
      { name: 'resolution', label: 'Resolution', type: 'object', required: true },
    ],
    outputFields: [
      { name: 'operationId', label: 'Operation ID', type: 'string', required: true },
      { name: 'status', label: 'Status', type: 'string', required: true },
    ],
  },

  // ─── Generic CRUD ──────────────────────────────────────────────────────────
  {
    id: 'action.create_record',
    name: 'Create Record',
    category: 'action',
    commandName: 'create_record',
    description: 'Create a new record in a target connector.',
    inputFields: [
      { name: 'tenantId', label: 'Tenant ID', type: 'string', required: true },
      { name: 'connectorId', label: 'Connector ID', type: 'string', required: true },
      { name: 'entityType', label: 'Entity Type', type: 'string', required: true },
      { name: 'data', label: 'Record Data', type: 'object', required: true },
    ],
    outputFields: [
      { name: 'operationId', label: 'Operation ID', type: 'string', required: true },
      { name: 'status', label: 'Status', type: 'string', required: true },
    ],
  },
  {
    id: 'action.update_record',
    name: 'Update Record',
    category: 'action',
    commandName: 'update_record',
    description: 'Update fields of an existing record in a target connector.',
    inputFields: [
      { name: 'tenantId', label: 'Tenant ID', type: 'string', required: true },
      { name: 'connectorId', label: 'Connector ID', type: 'string', required: true },
      { name: 'entityType', label: 'Entity Type', type: 'string', required: true },
      { name: 'entityId', label: 'Entity ID', type: 'string', required: true },
      { name: 'data', label: 'Fields to Update', type: 'object', required: true },
    ],
    outputFields: [
      { name: 'operationId', label: 'Operation ID', type: 'string', required: true },
      { name: 'status', label: 'Status', type: 'string', required: true },
    ],
  },
];
