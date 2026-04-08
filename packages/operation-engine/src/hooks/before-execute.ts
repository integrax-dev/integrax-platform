/**
 * Before-Execute Hook
 *
 * Runs immediately before the executor dispatches the plan.
 * Hooks can enrich context, add audit entries, or abort with an error.
 */

import type { OperationRequest } from '../core/operation.js';
import type { ExecutionPlan } from '../execution/planner.js';
import type { OperationError } from '../core/operation-error.js';

export interface BeforeExecuteContext {
  request: OperationRequest;
  plan: ExecutionPlan;
}

export type BeforeExecuteResult =
  | { proceed: true }
  | { proceed: false; error: OperationError };

export type BeforeExecuteHook = (
  ctx: BeforeExecuteContext,
) => Promise<BeforeExecuteResult> | BeforeExecuteResult;

export async function runBeforeExecuteHooks(
  hooks: BeforeExecuteHook[],
  ctx: BeforeExecuteContext,
): Promise<BeforeExecuteResult> {
  for (const hook of hooks) {
    const result = await hook(ctx);
    if (!result.proceed) return result;
  }
  return { proceed: true };
}
