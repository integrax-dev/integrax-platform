/**
 * Built-in command registrations
 *
 * These commands are always available regardless of profile.
 * Profile-specific commands are registered by their respective module manifests.
 *
 * Timeouts are read from env vars so they can be tuned per-deployment:
 *   PAYMENT_TIMEOUT_MS        (default 30 000)
 *   PAYMENT_SHORT_TIMEOUT_MS  (default 15 000)
 *   RECONCILE_TIMEOUT_MS      (default 60 000)
 */

import { CommandRegistry } from '@integrax/operation-engine';

function envMs(key: string, fallback: number): number {
  const v = process.env[key];
  const n = v ? parseInt(v, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

const PAYMENT_TIMEOUT_MS       = envMs('PAYMENT_TIMEOUT_MS',       30_000);
const PAYMENT_SHORT_TIMEOUT_MS = envMs('PAYMENT_SHORT_TIMEOUT_MS', 15_000);
const RECONCILE_TIMEOUT_MS     = envMs('RECONCILE_TIMEOUT_MS',     60_000);

export const commandRegistry = new CommandRegistry();

// ─── Record commands ──────────────────────────────────────────────────────────

commandRegistry.register({
  commandName: 'sync_record',
  description: 'Pull latest state of a remote record into the snapshot store',
  capability: 'sync_record',
});

commandRegistry.register({
  commandName: 'create_record',
  description: 'Create a new record in the target system',
  capability: 'create_record',
});

commandRegistry.register({
  commandName: 'update_record',
  description: 'Update fields of an existing record in the target system',
  capability: 'update_record',
});

// ─── Document commands ────────────────────────────────────────────────────────

commandRegistry.register({
  commandName: 'issue_invoice',
  description: 'Generate and authorize a fiscal invoice via the tenant-configured fiscal connector',
  capability: 'create_document',
  requiresApproval: false,
  timeoutMs: PAYMENT_TIMEOUT_MS,
});

commandRegistry.register({
  commandName: 'approve_document',
  description: 'Submit a pending document to the external system for approval',
  capability: 'approve_document',
  requiresApproval: true,
});

// ─── Catalog commands ─────────────────────────────────────────────────────────

commandRegistry.register({
  commandName: 'publish_catalog_item',
  description: 'Publish a product to all configured channels',
  capability: 'publish_record',
  profileIds: ['ecommerce'],
});

commandRegistry.register({
  commandName: 'archive_catalog_item',
  description: 'Archive a product across all channels',
  capability: 'archive_record',
  profileIds: ['ecommerce'],
});

// ─── Order / fulfillment commands ─────────────────────────────────────────────

commandRegistry.register({
  commandName: 'change_order_status',
  description: 'Transition an order to a new lifecycle status',
  capability: 'update_record',
  profileIds: ['ecommerce'],
});

// ─── Notification commands ────────────────────────────────────────────────────

commandRegistry.register({
  commandName: 'send_notification',
  description: 'Send a notification via email, WhatsApp, or other channel',
  capability: 'send_notification',
});

// ─── Ecommerce commands ───────────────────────────────────────────────────────

commandRegistry.register({
  commandName: 'ingest_catalog_item',
  description: 'Ingest a catalog item into the platform snapshot store',
  capability: 'create_record',
  profileIds: ['ecommerce'],
});

commandRegistry.register({
  commandName: 'start_checkout',
  description: 'Start a checkout session for a cart',
  capability: 'create_record',
  profileIds: ['ecommerce'],
});

commandRegistry.register({
  commandName: 'request_fulfillment',
  description: 'Request fulfillment for a placed order',
  capability: 'create_record',
  profileIds: ['ecommerce'],
});

// ─── Conflict resolution commands ────────────────────────────────────────────

commandRegistry.register({
  commandName: 'resolve_conflict',
  description: 'Mark a detected conflict as resolved and apply the winning value',
  capability: 'sync_record',
});

// ─── Payment commands ─────────────────────────────────────────────────────────
// Provider-neutral. Target connector is supplied in OperationRequest.target.connectorId.

commandRegistry.register({
  commandName: 'create_payment',
  description: 'Initiate a new payment through the target PSP',
  capability: 'create_payment',
  timeoutMs: PAYMENT_TIMEOUT_MS,
});

commandRegistry.register({
  commandName: 'authorize_payment',
  description: 'Authorize (hold) funds without capturing them',
  capability: 'authorize_payment',
  timeoutMs: PAYMENT_TIMEOUT_MS,
});

commandRegistry.register({
  commandName: 'capture_payment',
  description: 'Capture a previously authorized payment',
  capability: 'capture_payment',
  timeoutMs: PAYMENT_TIMEOUT_MS,
});

commandRegistry.register({
  commandName: 'refund_payment',
  description: 'Issue a full or partial refund for a captured payment',
  capability: 'refund_payment',
  requiresApproval: false,
  timeoutMs: PAYMENT_TIMEOUT_MS,
});

commandRegistry.register({
  commandName: 'cancel_payment',
  description: 'Void a pending or authorized payment',
  capability: 'cancel_payment',
  timeoutMs: PAYMENT_SHORT_TIMEOUT_MS,
});

commandRegistry.register({
  commandName: 'tokenize_payment_method',
  description: 'Store a payment instrument as a reusable PSP token',
  capability: 'tokenize_payment_method',
  timeoutMs: PAYMENT_SHORT_TIMEOUT_MS,
});

commandRegistry.register({
  commandName: 'create_subscription',
  description: 'Set up a recurring billing agreement',
  capability: 'create_subscription',
  timeoutMs: PAYMENT_TIMEOUT_MS,
});

commandRegistry.register({
  commandName: 'cancel_subscription',
  description: 'Terminate a recurring billing agreement',
  capability: 'cancel_subscription',
  timeoutMs: PAYMENT_SHORT_TIMEOUT_MS,
});

commandRegistry.register({
  commandName: 'create_checkout_link',
  description: 'Generate a hosted payment link or checkout URL',
  capability: 'create_checkout_link',
  timeoutMs: PAYMENT_SHORT_TIMEOUT_MS,
});

commandRegistry.register({
  commandName: 'generate_qr_payment',
  description: 'Create a QR code payment request',
  capability: 'generate_qr_payment',
  timeoutMs: PAYMENT_SHORT_TIMEOUT_MS,
});

commandRegistry.register({
  commandName: 'reconcile_payment',
  description: 'Reconcile canonical payment state against live PSP state',
  capability: 'reconcile_payment',
  timeoutMs: RECONCILE_TIMEOUT_MS,
});

commandRegistry.register({
  commandName: 'send_payment_reminder',
  description: 'Send a payment reminder to a payer via email, WhatsApp, or SMS',
  capability: 'send_payment_reminder',
  timeoutMs: PAYMENT_SHORT_TIMEOUT_MS,
});
