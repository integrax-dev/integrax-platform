/**
 * Dispatcher
 *
 * Routes ExecutionPlan targets to the correct handler:
 * - facade: calls facade.execute(operation, payload) via FacadeResolver
 * - module: calls the registered module action handler
 *
 * The dispatcher does NOT retry — that is the executor's responsibility.
 */

import type { ExecutionPlan, ExecutionTarget } from './planner.js';
import { makeError, type OperationError } from '../core/operation-error.js';

/** Minimal facade interface required by the dispatcher. */
export interface DispatchableFacade {
  execute(operation: string, input: Record<string, unknown>): Promise<unknown>;
}

/** Module action handler registered by a domain module. */
export type ModuleActionHandler = (
  tenantId: string,
  action: string,
  payload: Record<string, unknown>,
) => Promise<unknown>;

export interface DispatcherConfig {
  /** Returns a facade for the given (connectorId, tenantId). */
  resolveFacade: (connectorId: string, tenantId: string) => DispatchableFacade | undefined;
  /** Module action handlers keyed by systemId. */
  moduleHandlers?: Record<string, ModuleActionHandler>;
}

export interface DispatchResult {
  value?: unknown;
  error?: OperationError;
}

export class Dispatcher {
  constructor(private readonly config: DispatcherConfig) {}

  async dispatch(plan: ExecutionPlan): Promise<DispatchResult> {
    return this.dispatchTarget(plan.tenantId, plan.target);
  }

  private async dispatchTarget(
    tenantId: string,
    target: ExecutionTarget,
  ): Promise<DispatchResult> {
    if (target.kind === 'facade') {
      const facade = this.config.resolveFacade(target.connectorId, tenantId);
      if (!facade) {
        return {
          error: makeError(
            'TARGET_NOT_FOUND',
            `No facade registered for connector '${target.connectorId}'`,
            'execution',
          ),
        };
      }
      try {
        const value = await facade.execute(target.operation, target.payload);
        return { value };
      } catch (err) {
        return {
          error: makeError(
            'EXECUTION_FAILED',
            err instanceof Error ? err.message : String(err),
            'execution',
            { retryable: true, cause: err },
          ),
        };
      }
    }

    if (target.kind === 'module') {
      const handler = this.config.moduleHandlers?.[target.systemId];
      if (!handler) {
        return {
          error: makeError(
            'TARGET_NOT_FOUND',
            `No module action handler registered for system '${target.systemId}'`,
            'execution',
          ),
        };
      }
      try {
        const value = await handler(tenantId, target.action, target.payload);
        return { value };
      } catch (err) {
        return {
          error: makeError(
            'EXECUTION_FAILED',
            err instanceof Error ? err.message : String(err),
            'execution',
            { retryable: true, cause: err },
          ),
        };
      }
    }

    return {
      error: makeError('INTERNAL_ERROR', 'Unknown execution target kind', 'internal'),
    };
  }
}
