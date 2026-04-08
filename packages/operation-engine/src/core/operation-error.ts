/**
 * Operation Error Types
 *
 * Categorized errors for structured failure handling and DLQ routing.
 */

export type OperationErrorCode =
  | 'VALIDATION_FAILED'         // request schema or business rule violation
  | 'PERMISSION_DENIED'         // actor lacks required role/permission
  | 'CAPABILITY_NOT_SUPPORTED'  // connector/system doesn't support this command
  | 'STATE_CONFLICT'            // entity is in a state that blocks this operation
  | 'APPROVAL_REQUIRED'         // operation needs approval before execution
  | 'APPROVAL_REJECTED'         // approver explicitly denied
  | 'TARGET_NOT_FOUND'          // connector/system/entity not found
  | 'EXECUTION_FAILED'          // facade.execute() threw
  | 'TIMEOUT'                   // operation exceeded time budget
  | 'RETRY_EXHAUSTED'           // all retry attempts failed
  | 'IDEMPOTENCY_CONFLICT'      // same idempotencyKey with different payload
  | 'INTERNAL_ERROR';           // unexpected engine error

export interface OperationError {
  code: OperationErrorCode;
  message: string;
  /** The step in the lifecycle where the error occurred. */
  phase: 'validation' | 'permission' | 'capability' | 'state' | 'approval' | 'execution' | 'internal';
  /** Underlying error if available. */
  cause?: unknown;
  /** For retryable errors: when to retry. */
  retryAfter?: Date;
  /** Whether a retry is expected to succeed. */
  retryable: boolean;
}

export function makeError(
  code: OperationErrorCode,
  message: string,
  phase: OperationError['phase'],
  opts: Partial<Pick<OperationError, 'cause' | 'retryable' | 'retryAfter'>> = {},
): OperationError {
  return {
    code,
    message,
    phase,
    retryable: opts.retryable ?? false,
    cause: opts.cause,
    retryAfter: opts.retryAfter,
  };
}
