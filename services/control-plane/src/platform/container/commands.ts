/**
 * Built-in command registrations
 *
 * These commands are always available regardless of profile.
 * Profile-specific commands are registered by their respective module manifests.
 */

import { CommandRegistry } from '@integrax/operation-engine';

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
  description: 'Generate and authorize a fiscal invoice (e.g. AFIP WSFE)',
  capability: 'create_document',
  defaultConnectorId: 'afip-wsfe',
  requiresApproval: false,
  timeoutMs: 30_000,
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

// ─── Conflict resolution commands ────────────────────────────────────────────

commandRegistry.register({
  commandName: 'resolve_conflict',
  description: 'Mark a detected conflict as resolved and apply the winning value',
  capability: 'sync_record',
});
