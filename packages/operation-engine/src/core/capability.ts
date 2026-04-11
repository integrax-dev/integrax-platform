/**
 * Capability Model
 *
 * Neutral capabilities that connectors and modules can advertise.
 * More granular than the connector-sdk's read/write flags.
 * Profiles may define domain-specific aliases on top of these.
 */

export type OperationCapability =
  // ─── Generic CRUD ──────────────────────────────────────────────────────────
  | 'create_record'       // create a new entity
  | 'update_record'       // mutate an existing entity
  | 'delete_record'       // hard or soft delete
  | 'publish_record'      // make a draft publicly visible
  | 'archive_record'      // move to inactive/archived state
  | 'send_notification'   // outbound message (email, WhatsApp, SMS…)
  | 'create_document'     // generate a document (invoice, report…)
  | 'approve_document'    // fiscal or business approval (e.g. CAE)
  | 'sync_record'         // push local state to external system
  | 'resolve_conflict'    // mark a detected divergence as resolved

  // ─── Payment capabilities ─────────────────────────────────────────────────
  // These are explicit so that capability validation can catch misuse
  // (e.g. sending a refund command to a connector that only supports create_payment).
  | 'create_payment'           // initiate a new payment transaction
  | 'authorize_payment'        // hold funds without capturing
  | 'capture_payment'          // capture a previously authorized payment
  | 'refund_payment'           // issue full or partial refund
  | 'cancel_payment'           // void a pending/authorized payment
  | 'tokenize_payment_method'  // store card/bank details as a reusable token
  | 'create_subscription'      // set up recurring billing
  | 'cancel_subscription'      // terminate a subscription
  | 'create_checkout_link'     // generate a hosted payment link / checkout URL
  | 'generate_qr_payment'      // create a QR code payment request
  | 'create_split_payment'     // split amount across multiple recipients
  | 'reconcile_payment'        // match payment records across systems
  | 'send_payment_reminder'    // notify payer of a pending/overdue payment

  | 'custom';                  // domain-specific; described by commandName

/** Maps a connectorId or systemId to the capabilities it supports. */
export type CapabilityMap = Record<string, OperationCapability[]>;

/** Derives the most likely capability from a command name (best-effort). */
export function inferCapability(commandName: string): OperationCapability {
  // ─── Payment-specific (checked before generic prefixes) ───────────────────
  if (commandName === 'create_payment') return 'create_payment';
  if (commandName === 'authorize_payment') return 'authorize_payment';
  if (commandName === 'capture_payment') return 'capture_payment';
  if (commandName === 'refund_payment') return 'refund_payment';
  if (commandName === 'cancel_payment') return 'cancel_payment';
  if (commandName === 'tokenize_payment_method') return 'tokenize_payment_method';
  if (commandName === 'create_subscription') return 'create_subscription';
  if (commandName === 'cancel_subscription') return 'cancel_subscription';
  if (commandName === 'create_checkout_link') return 'create_checkout_link';
  if (commandName === 'generate_qr_payment') return 'generate_qr_payment';
  if (commandName === 'create_split_payment') return 'create_split_payment';
  if (commandName === 'reconcile_payment') return 'reconcile_payment';
  if (commandName === 'send_payment_reminder') return 'send_payment_reminder';

  // ─── Generic ──────────────────────────────────────────────────────────────
  if (commandName.startsWith('create_')) return 'create_record';
  if (commandName.startsWith('update_')) return 'update_record';
  if (commandName.startsWith('delete_')) return 'delete_record';
  if (commandName.startsWith('publish_')) return 'publish_record';
  if (commandName.startsWith('archive_')) return 'archive_record';
  if (commandName.startsWith('send_')) return 'send_notification';
  if (commandName.startsWith('approve_')) return 'approve_document';
  if (commandName.startsWith('sync_')) return 'sync_record';
  if (commandName.startsWith('resolve_')) return 'resolve_conflict';
  if (commandName.startsWith('issue_') || commandName.startsWith('create_document')) return 'create_document';
  return 'custom';
}
