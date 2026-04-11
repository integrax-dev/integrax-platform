/**
 * Executor
 *
 * Runs the ExecutionPlan with timeout and retry.
 * Records each attempt. Returns the final OperationResult.
 */

import type { ExecutionPlan } from './planner.js';
import type { Dispatcher } from './dispatcher.js';
import type { OperationAttemptStore } from '../storage/operation-attempt-store.js';
import { withTimeout } from './timeout-policy.js';
import { shouldRetry, type RetryPolicy } from './retry-policy.js';
import { makeError } from '../core/operation-error.js';

export interface ExecutorResult {
  value?: unknown;
  errors: import('../core/operation-error.js').OperationError[];
  attemptCount: number;
  durationMs: number;
  succeeded: boolean;
}

export interface ExecutorConfig {
  dispatcher: Dispatcher;
  attemptStore?: OperationAttemptStore;
  retryPolicy?: RetryPolicy;
}

export class Executor {
  constructor(private readonly config: ExecutorConfig) {}

  async execute(plan: ExecutionPlan): Promise<ExecutorResult> {
    const start = Date.now();
    let attemptCount = 0;
    const errors: import('../core/operation-error.js').OperationError[] = [];

    while (true) {
      attemptCount++;
      const attemptStart = Date.now();

      const result = await withTimeout(
        () => this.config.dispatcher.dispatch(plan),
        plan.timeoutMs,
      );

      const attemptDurationMs = Date.now() - attemptStart;

      if (this.config.attemptStore) {
        await this.config.attemptStore.record({
          operationId: plan.operationId,
          tenantId: plan.tenantId,
          attemptNumber: attemptCount,
          startedAt: new Date(attemptStart),
          durationMs: attemptDurationMs,
          succeeded: !result.timedOut && !result.error && result.value !== undefined,
          error: result.error ?? (result.timedOut ? makeError('TIMEOUT', `Timed out after ${plan.timeoutMs}ms`, 'execution') : undefined),
        });
      }

      if (result.timedOut || result.error) {
        const err = result.error ?? makeError('TIMEOUT', `Timed out after ${plan.timeoutMs}ms`, 'execution');
        errors.push(err);

        const retryPolicy = this.config.retryPolicy;
        const decision = shouldRetry(err, attemptCount, retryPolicy);

        if (!decision.shouldRetry) {
          return {
            errors,
            attemptCount,
            durationMs: Date.now() - start,
            succeeded: false,
          };
        }

        // Wait before retry
        if (decision.delayMs > 0) {
          await new Promise(resolve => setTimeout(resolve, decision.delayMs));
        }
        continue;
      }

      return {
        value: result.value?.value,
        errors: [],
        attemptCount,
        durationMs: Date.now() - start,
        succeeded: true,
      };
    }
  }
}
