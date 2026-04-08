/**
 * Capability Model
 *
 * Neutral capabilities that connectors and modules can advertise.
 * More granular than the connector-sdk's read/write flags.
 * Profiles may define domain-specific aliases on top of these.
 */

export type OperationCapability =
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
  | 'custom';             // domain-specific; described by commandName

/** Maps a connectorId or systemId to the capabilities it supports. */
export type CapabilityMap = Record<string, OperationCapability[]>;

/** Derives the most likely capability from a command name (best-effort). */
export function inferCapability(commandName: string): OperationCapability {
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
