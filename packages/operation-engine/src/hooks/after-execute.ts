/**
 * After-Execute Hook
 *
 * Runs after the executor returns, regardless of success or failure.
 * Used for notifications, derived state updates, custom audit entries.
 */

import type { OperationRecord } from '../core/operation.js';
import type { ExecutorResult } from '../execution/executor.js';

export interface AfterExecuteContext {
  record: OperationRecord;
  executorResult: ExecutorResult;
}

export type AfterExecuteHook = (ctx: AfterExecuteContext) => Promise<void> | void;

export async function runAfterExecuteHooks(
  hooks: AfterExecuteHook[],
  ctx: AfterExecuteContext,
): Promise<void> {
  for (const hook of hooks) {
    try {
      await hook(ctx);
    } catch {
      // After-execute hooks must not interrupt the operation result.
      // Errors here are swallowed — add observability if needed.
    }
  }
}
