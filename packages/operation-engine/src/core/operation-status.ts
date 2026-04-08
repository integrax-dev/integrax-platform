/**
 * Operation Status Lifecycle
 *
 * Covers multi-tenant SaaS, fiscal workflows, approval chains, and async retries.
 */

export type OperationStatus =
  | 'draft'                   // built but not yet submitted
  | 'requested'               // submitted, not yet validated
  | 'validating'              // validation in progress
  | 'rejected'                // failed validation or permission check
  | 'awaiting_approval'       // valid, waiting for human/system approval
  | 'approved'                // approval granted, ready to execute
  | 'queued'                  // approved, waiting for execution slot
  | 'running'                 // executor is active
  | 'succeeded'               // completed with all steps successful
  | 'partially_succeeded'     // some steps succeeded, some failed (batch ops)
  | 'failed'                  // execution failed, no more retries
  | 'retry_scheduled'         // transient failure, retry pending
  | 'manual_review_required'  // auto-retry exhausted, human must intervene
  | 'cancelled';              // cancelled before completion

/** Terminal statuses — no further transitions possible. */
export const TERMINAL_STATUSES: ReadonlySet<OperationStatus> = new Set([
  'rejected',
  'succeeded',
  'failed',
  'cancelled',
]);

/** Statuses that represent an active execution. */
export const ACTIVE_STATUSES: ReadonlySet<OperationStatus> = new Set([
  'validating',
  'queued',
  'running',
  'retry_scheduled',
]);

export function isTerminal(status: OperationStatus): boolean {
  return TERMINAL_STATUSES.has(status);
}

export function isActive(status: OperationStatus): boolean {
  return ACTIVE_STATUSES.has(status);
}
