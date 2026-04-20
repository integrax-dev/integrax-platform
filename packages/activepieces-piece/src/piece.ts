/**
 * IntegraX Activepieces Piece
 *
 * Deploy this to your self-hosted Activepieces instance.
 * Each action calls the IntegraX REST API to submit an operation.
 * Each trigger registers a webhook subscription via IntegraX so events
 * are forwarded to the Activepieces flow when they fire.
 *
 * Auth required per connection:
 *   baseUrl   — e.g. https://api.integrax.io
 *   apiKey    — Bearer token (ixk_...)
 *   tenantId  — e.g. ten_01ABCDEF
 */

import {
  createPiece,
  PieceAuth,
  Property,
  createAction,
  createTrigger,
  TriggerStrategy,
} from '@activepieces/pieces-framework';

// ─── Auth ─────────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const integraxAuth: any = PieceAuth.CustomAuth({
  description: 'IntegraX API credentials',
  props: {
    baseUrl: Property.ShortText({
      displayName: 'IntegraX Base URL',
      description: 'e.g. https://api.integrax.io',
      required: true,
    }),
    apiKey: Property.ShortText({
      displayName: 'API Key (ixk_...)',
      required: true,
    }),
    tenantId: Property.ShortText({
      displayName: 'Tenant ID',
      required: true,
    }),
  },
  validate: async ({ auth }: { auth: unknown }) => {
    const { baseUrl, apiKey, tenantId } = resolveAuth(auth);
    try {
      const res = await fetch(`${baseUrl}/api/tenants/${tenantId}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (res.ok) return { valid: true };
      return { valid: false, error: `HTTP ${res.status}` };
    } catch (e) {
      return { valid: false, error: String(e) };
    }
  },
} as never);

// ─── Helpers ──────────────────────────────────────────────────────────────────

type AuthProps = { baseUrl: string; apiKey: string; tenantId: string };

function resolveAuth(raw: unknown): AuthProps {
  const a = raw as Record<string, unknown>;
  // AP wraps custom auth in a .props object; fall back to top-level for older versions.
  const p = (a['props'] as Record<string, unknown>) ?? a;
  return { baseUrl: p['baseUrl'] as string, apiKey: p['apiKey'] as string, tenantId: p['tenantId'] as string };
}

async function submitOperation(
  auth: unknown,
  commandName: string,
  connectorId: string | undefined,
  payload: Record<string, unknown>,
  idempotencyKey?: string,
) {
  const { baseUrl, apiKey, tenantId } = resolveAuth(auth);
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
  };
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;

  const res = await fetch(`${baseUrl}/api/tenants/${tenantId}/operations`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      commandName,
      target: connectorId ? { connectorId } : {},
      payload,
    }),
  });
  return res.json();
}

async function registerWebhookSubscription(
  rawAuth: unknown,
  eventType: string,
  callbackUrl: string,
): Promise<{ id: string }> {
  const { baseUrl, apiKey, tenantId } = resolveAuth(rawAuth);
  const res = await fetch(
    `${baseUrl}/api/tenants/${tenantId}/trigger-subscriptions`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ eventType, callbackUrl }),
    },
  );
  const body = await res.json() as { success: boolean; data: { id: string } };
  return body.data;
}

async function deleteWebhookSubscription(
  rawAuth: unknown,
  subscriptionId: string,
): Promise<void> {
  const { baseUrl, apiKey, tenantId } = resolveAuth(rawAuth);
  await fetch(
    `${baseUrl}/api/tenants/${tenantId}/trigger-subscriptions/${subscriptionId}`,
    { method: 'DELETE', headers: { Authorization: `Bearer ${apiKey}` } },
  );
}

// ─── Trigger factory ──────────────────────────────────────────────────────────

function makeWebhookTrigger(
  name: string,
  displayName: string,
  description: string,
  eventType: string,
  extraProps: Record<string, ReturnType<typeof Property.ShortText>> = {},
) {
  return createTrigger({
    name,
    displayName,
    description,
    auth: integraxAuth,
    props: extraProps,
    type: TriggerStrategy.WEBHOOK,
    async onEnable(ctx: never) {
      const { auth, webhookUrl, store } = ctx as { auth: unknown; webhookUrl: string; store: { put: (k: string, v: unknown) => Promise<void> } };
      const sub = await registerWebhookSubscription(auth, eventType, webhookUrl);
      await store.put('subscriptionId', sub.id);
    },
    async onDisable(ctx: never) {
      const { auth, store } = ctx as { auth: unknown; store: { get: (k: string) => Promise<string | null> } };
      const id = await store.get('subscriptionId');
      if (id) await deleteWebhookSubscription(auth, id);
    },
    async run(ctx: never) {
      const { payload } = ctx as { payload: { body: unknown } };
      return [payload.body];
    },
  } as never);
}

// ─── Action factory ───────────────────────────────────────────────────────────

function makeSimpleAction(
  name: string,
  displayName: string,
  description: string,
  commandName: string,
  props: Record<string, unknown>,
  connectorProp = true,
) {
  const allProps: Record<string, unknown> = {
    ...props,
    idempotencyKey: Property.ShortText({
      displayName: 'Idempotency Key',
      description: 'Optional — prevents duplicate execution on retry.',
      required: false,
    }),
  };
  if (connectorProp) {
    allProps['connectorId'] = Property.ShortText({
      displayName: 'Connector ID',
      description: 'Target connector (e.g. mercadopago, afip-wsfe, email)',
      required: false,
    });
  }

  return createAction({
    name,
    displayName,
    description,
    auth: integraxAuth,
    props: allProps as never,
    async run(ctx) {
      const { connectorId, idempotencyKey, ...payload } = ctx.propsValue as Record<string, unknown>;
      return submitOperation(
        ctx.auth,
        commandName,
        connectorId as string | undefined,
        payload as Record<string, unknown>,
        idempotencyKey as string | undefined,
      );
    },
  });
}

// ─── Triggers ─────────────────────────────────────────────────────────────────

const PIECE_TRIGGERS = [
  makeWebhookTrigger('order_created', 'Order Created', 'Fires when a new order is created.', 'order.created'),
  makeWebhookTrigger('order_updated', 'Order Updated', 'Fires when an order is modified.', 'order.updated'),
  makeWebhookTrigger('order_status_changed', 'Order Status Changed', 'Fires when an order status changes.', 'order.status_changed'),
  makeWebhookTrigger('order_cancelled', 'Order Cancelled', 'Fires when an order is cancelled.', 'order.cancelled'),
  makeWebhookTrigger('product_created', 'Product Created', 'Fires when a product is added.', 'product.created'),
  makeWebhookTrigger('product_updated', 'Product Updated', 'Fires when a product is modified.', 'product.updated'),
  makeWebhookTrigger('product_price_changed', 'Product Price Changed', 'Fires when a product price changes.', 'product.price_changed'),
  makeWebhookTrigger('product_archived', 'Product Archived', 'Fires when a product is archived.', 'product.archived'),
  makeWebhookTrigger('stock_changed', 'Stock Changed', 'Fires when stock changes.', 'stock.changed'),
  makeWebhookTrigger('stock_diverged', 'Stock Diverged', 'Fires when stock diverges across systems.', 'stock.diverged'),
  makeWebhookTrigger('stock_depleted', 'Stock Depleted', 'Fires when stock reaches zero.', 'stock.depleted'),
  makeWebhookTrigger('invoice_created', 'Invoice Created', 'Fires when an invoice is generated.', 'invoice.created'),
  makeWebhookTrigger('invoice_authorized', 'Invoice Authorized', 'Fires when an invoice is authorized.', 'invoice.authorized'),
  makeWebhookTrigger('invoice_failed', 'Invoice Failed', 'Fires when invoice authorization fails.', 'invoice.failed'),
  makeWebhookTrigger('invoice_voided', 'Invoice Voided', 'Fires when an invoice is voided.', 'invoice.voided'),
  makeWebhookTrigger('customer_created', 'Customer Created', 'Fires when a customer is registered.', 'customer.created'),
  makeWebhookTrigger('customer_updated', 'Customer Updated', 'Fires when customer data is updated.', 'customer.updated'),
  makeWebhookTrigger('payment_created', 'Payment Created', 'Fires when a payment is initiated.', 'payment.created'),
  makeWebhookTrigger('payment_authorized', 'Payment Authorized', 'Fires when a payment is authorized.', 'payment.authorized'),
  makeWebhookTrigger('payment_captured', 'Payment Captured', 'Fires when a payment is captured.', 'payment.captured'),
  makeWebhookTrigger('payment_failed', 'Payment Failed', 'Fires when a payment fails.', 'payment.failed'),
  makeWebhookTrigger('payment_refunded', 'Payment Refunded', 'Fires when a payment is refunded.', 'payment.refunded'),
  makeWebhookTrigger('payment_chargeback', 'Chargeback Received', 'Fires when a chargeback is received.', 'payment.chargeback'),
  makeWebhookTrigger('shipment_created', 'Shipment Created', 'Fires when a shipment is created.', 'shipment.created'),
  makeWebhookTrigger('shipment_status_changed', 'Shipment Status Changed', 'Fires when shipment status updates.', 'shipment.status_changed'),
  makeWebhookTrigger('shipment_delivered', 'Shipment Delivered', 'Fires when a shipment is delivered.', 'shipment.delivered'),
  makeWebhookTrigger('conflict_detected', 'Conflict Detected', 'Fires when a data inconsistency is detected.', 'conflict.detected'),
  makeWebhookTrigger('conflict_resolved', 'Conflict Resolved', 'Fires when a conflict is resolved.', 'conflict.resolved'),
  makeWebhookTrigger('operation_approval_required', 'Approval Required', 'Fires when an operation needs manual approval.', 'operation.approval_required'),
  makeWebhookTrigger('operation_succeeded', 'Operation Succeeded', 'Fires when an operation completes.', 'operation.succeeded'),
  makeWebhookTrigger('operation_failed', 'Operation Failed', 'Fires when an operation fails.', 'operation.failed'),
  makeWebhookTrigger('subscription_created', 'Subscription Created', 'Fires when a subscription is created.', 'subscription.created'),
  makeWebhookTrigger('subscription_past_due', 'Subscription Past Due', 'Fires when a subscription is past due.', 'subscription.past_due'),
  makeWebhookTrigger('subscription_cancelled', 'Subscription Cancelled', 'Fires when a subscription is cancelled.', 'subscription.cancelled'),
  makeWebhookTrigger('reconciliation_conflict', 'Reconciliation Conflict', 'Fires when reconciliation finds a mismatch.', 'reconciliation.conflict.detected'),
  makeWebhookTrigger('webhook_received', 'Webhook Received', 'Fires when an external webhook is received.', 'webhook.received'),
];

// ─── Actions ──────────────────────────────────────────────────────────────────

const PIECE_ACTIONS = [
  makeSimpleAction('issue_invoice', 'Issue Invoice', 'Generate and authorize a fiscal invoice.',
    'issue_invoice', {
      invoiceData: Property.Object({ displayName: 'Invoice Data', required: true }),
    }),
  makeSimpleAction('publish_catalog_item', 'Publish Product', 'Publish a product to all channels.',
    'publish_catalog_item', {
      sku: Property.ShortText({ displayName: 'SKU', required: true }),
      productData: Property.Object({ displayName: 'Product Data', required: true }),
    }),
  makeSimpleAction('archive_catalog_item', 'Archive Product', 'Archive a product across all channels.',
    'archive_catalog_item', {
      sku: Property.ShortText({ displayName: 'SKU', required: true }),
    }),
  makeSimpleAction('ingest_catalog_item', 'Ingest Catalog Item', 'Ingest a product into IntegraX.',
    'ingest_catalog_item', {
      item: Property.Object({ displayName: 'Catalog Item', required: true }),
    }, false),
  makeSimpleAction('update_stock', 'Update Stock', 'Update stock quantity for a SKU.',
    'update_record', {
      sku: Property.ShortText({ displayName: 'SKU', required: true }),
      quantity: Property.Number({ displayName: 'Quantity', required: true }),
      location: Property.ShortText({ displayName: 'Location', required: false }),
    }),
  makeSimpleAction('sync_record', 'Sync Record', 'Pull latest state into IntegraX snapshot store.',
    'sync_record', {
      entityType: Property.ShortText({ displayName: 'Entity Type', required: true }),
      entityId: Property.ShortText({ displayName: 'Entity ID', required: true }),
    }),
  makeSimpleAction('change_order_status', 'Change Order Status', 'Transition an order to a new status.',
    'change_order_status', {
      orderId: Property.ShortText({ displayName: 'Order ID', required: true }),
      newStatus: Property.ShortText({ displayName: 'New Status', required: true }),
    }, false),
  makeSimpleAction('start_checkout', 'Start Checkout', 'Start a checkout session for a cart.',
    'start_checkout', {
      cartId: Property.ShortText({ displayName: 'Cart ID', required: true }),
    }, false),
  makeSimpleAction('request_fulfillment', 'Request Fulfillment', 'Request fulfillment for an order.',
    'request_fulfillment', {
      orderId: Property.ShortText({ displayName: 'Order ID', required: true }),
      fulfillmentData: Property.Object({ displayName: 'Fulfillment Data', required: false }),
    }, false),
  makeSimpleAction('create_payment', 'Create Payment', 'Initiate a payment through the configured PSP.',
    'create_payment', {
      amount: Property.Number({ displayName: 'Amount', required: true }),
      currency: Property.ShortText({ displayName: 'Currency', required: true }),
      paymentData: Property.Object({ displayName: 'Payment Data', required: true }),
    }),
  makeSimpleAction('authorize_payment', 'Authorize Payment', 'Authorize (hold) funds.',
    'authorize_payment', {
      amount: Property.Number({ displayName: 'Amount', required: true }),
      currency: Property.ShortText({ displayName: 'Currency', required: true }),
      paymentData: Property.Object({ displayName: 'Payment Data', required: true }),
    }),
  makeSimpleAction('capture_payment', 'Capture Payment', 'Capture a previously authorized payment.',
    'capture_payment', {
      paymentId: Property.ShortText({ displayName: 'Payment ID', required: true }),
      amount: Property.Number({ displayName: 'Partial Capture Amount', required: false }),
    }),
  makeSimpleAction('refund_payment', 'Refund Payment', 'Issue a full or partial refund.',
    'refund_payment', {
      paymentId: Property.ShortText({ displayName: 'Payment ID', required: true }),
      amount: Property.Number({ displayName: 'Refund Amount (blank = full)', required: false }),
      reason: Property.ShortText({ displayName: 'Reason', required: false }),
    }),
  makeSimpleAction('cancel_payment', 'Cancel Payment', 'Void a pending or authorized payment.',
    'cancel_payment', {
      paymentId: Property.ShortText({ displayName: 'Payment ID', required: true }),
    }),
  makeSimpleAction('create_checkout_link', 'Create Checkout Link', 'Generate a hosted payment link.',
    'create_checkout_link', {
      amount: Property.Number({ displayName: 'Amount', required: true }),
      currency: Property.ShortText({ displayName: 'Currency', required: true }),
      description: Property.LongText({ displayName: 'Description', required: false }),
      expiresAt: Property.ShortText({ displayName: 'Expires At (ISO-8601)', required: false }),
    }),
  makeSimpleAction('generate_qr_payment', 'Generate QR Payment', 'Create a QR code payment request.',
    'generate_qr_payment', {
      amount: Property.Number({ displayName: 'Amount', required: true }),
      currency: Property.ShortText({ displayName: 'Currency', required: true }),
      description: Property.LongText({ displayName: 'Description', required: false }),
    }),
  makeSimpleAction('tokenize_payment_method', 'Tokenize Payment Method', 'Store a payment method as a PSP token.',
    'tokenize_payment_method', {
      paymentMethodData: Property.Object({ displayName: 'Payment Method Data', required: true }),
    }),
  makeSimpleAction('create_subscription', 'Create Subscription', 'Set up a recurring billing agreement.',
    'create_subscription', {
      subscriptionData: Property.Object({ displayName: 'Subscription Data', required: true }),
    }),
  makeSimpleAction('cancel_subscription', 'Cancel Subscription', 'Terminate a recurring billing agreement.',
    'cancel_subscription', {
      subscriptionId: Property.ShortText({ displayName: 'Subscription ID', required: true }),
    }),
  makeSimpleAction('reconcile_payment', 'Reconcile Payment', 'Reconcile payment state against live PSP.',
    'reconcile_payment', {
      paymentId: Property.ShortText({ displayName: 'Payment ID', required: true }),
    }),
  makeSimpleAction('send_payment_reminder', 'Send Payment Reminder', 'Send a payment reminder.',
    'send_payment_reminder', {
      paymentId: Property.ShortText({ displayName: 'Payment ID', required: true }),
      channel: Property.StaticDropdown({
        displayName: 'Channel',
        required: true,
        options: { options: [
          { label: 'Email', value: 'email' },
          { label: 'WhatsApp', value: 'whatsapp' },
          { label: 'SMS', value: 'sms' },
        ]},
      }),
    }, false),
  makeSimpleAction('send_notification', 'Send Notification', 'Send via email, WhatsApp, or other channel.',
    'send_notification', {
      recipient: Property.ShortText({ displayName: 'Recipient', required: true }),
      subject: Property.ShortText({ displayName: 'Subject', required: false }),
      body: Property.LongText({ displayName: 'Message Body', required: true }),
      templateId: Property.ShortText({ displayName: 'Template ID', required: false }),
    }),
  makeSimpleAction('resolve_conflict', 'Resolve Conflict', 'Mark a detected conflict as resolved.',
    'resolve_conflict', {
      entityType: Property.ShortText({ displayName: 'Entity Type', required: true }),
      entityId: Property.ShortText({ displayName: 'Entity ID', required: true }),
      resolution: Property.Object({ displayName: 'Resolution', required: true }),
    }, false),
  makeSimpleAction('create_record', 'Create Record', 'Create a record in a target connector.',
    'create_record', {
      entityType: Property.ShortText({ displayName: 'Entity Type', required: true }),
      data: Property.Object({ displayName: 'Record Data', required: true }),
    }),
  makeSimpleAction('update_record', 'Update Record', 'Update fields in a target connector.',
    'update_record', {
      entityType: Property.ShortText({ displayName: 'Entity Type', required: true }),
      entityId: Property.ShortText({ displayName: 'Entity ID', required: true }),
      data: Property.Object({ displayName: 'Fields to Update', required: true }),
    }),
];

// ─── Piece ────────────────────────────────────────────────────────────────────

export const integraxPiece = createPiece({
  displayName: 'IntegraX',
  description: 'Multi-tenant integration platform for LatAm ecommerce. Connect orders, payments, invoices, stock, and more.',
  logoUrl: 'https://integrax.io/logo.png',
  minimumSupportedRelease: '0.20.0',
  auth: integraxAuth,
  actions: PIECE_ACTIONS as never[],
  triggers: PIECE_TRIGGERS as never[],
} as never);
