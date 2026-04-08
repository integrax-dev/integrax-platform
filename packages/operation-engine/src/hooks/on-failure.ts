/**
 * On-Failure Hook
 *
 * Runs when an operation reaches a terminal failure status.
 * Used for alerting, compensation actions, or escalation.
 */

import type { OperationRecord } from '../core/operation.js';
import type { OperationError } from '../core/operation-error.js';

export interface OnFailureContext {
  record: OperationRecord;
  errors: OperationError[];
}

export type OnFailureHook = (ctx: OnFailureContext) => Promise<void> | void;

export async function runOnFailureHooks(
  hooks: OnFailureHook[],
  ctx: OnFailureContext,
): Promise<void> {
  for (const hook of hooks) {
    try {
      await hook(ctx);
    } catch {
      // Failure hooks must not throw — failures in failure handling are ignored.
    }
  }
}
