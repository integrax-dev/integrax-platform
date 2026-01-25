/**
 * Decorator utilities for connector actions.
 * These can be used to add cross-cutting concerns like logging, metrics, etc.
 */

import type { ActionResult, ExecutionContext } from './types/index.js';
import type { Logger, MetricsRecorder } from './observability.js';

/**
 * Options for action execution wrappers.
 */
export interface ActionWrapperOptions {
  logger?: Logger;
  metrics?: MetricsRecorder;
  connectorId: string;
  actionId: string;
}

/**
 * Wrap an action handler with logging.
 */
export function withLogging<TInput, TOutput>(
  handler: (input: TInput, context: ExecutionContext) => Promise<TOutput>,
  options: ActionWrapperOptions
): (input: TInput, context: ExecutionContext) => Promise<TOutput> {
  const { logger, connectorId, actionId } = options;

  if (!logger) return handler;

  return async (input, context) => {
    const startTime = Date.now();

    logger.info({
      event: 'action_started',
      connectorId,
      actionId,
      correlationId: context.correlationId,
      tenantId: context.tenantId,
    });

    try {
      const result = await handler(input, context);

      logger.info({
        event: 'action_completed',
        connectorId,
        actionId,
        correlationId: context.correlationId,
        durationMs: Date.now() - startTime,
      });

      return result;
    } catch (error) {
      logger.error({
        event: 'action_failed',
        connectorId,
        actionId,
        correlationId: context.correlationId,
        durationMs: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error),
      });

      throw error;
    }
  };
}

/**
 * Wrap an action handler with metrics collection.
 */
export function withMetrics<TInput, TOutput>(
  handler: (input: TInput, context: ExecutionContext) => Promise<TOutput>,
  options: ActionWrapperOptions
): (input: TInput, context: ExecutionContext) => Promise<TOutput> {
  const { metrics, connectorId, actionId } = options;

  if (!metrics) return handler;

  return async (input, context) => {
    const startTime = Date.now();
    const tags = { connector: connectorId, action: actionId, tenant: context.tenantId };

    metrics.increment('action.started', 1, tags);

    try {
      const result = await handler(input, context);

      metrics.increment('action.success', 1, tags);
      metrics.timing('action.duration', Date.now() - startTime, tags);

      return result;
    } catch (error) {
      metrics.increment('action.error', 1, tags);
      metrics.timing('action.duration', Date.now() - startTime, tags);

      throw error;
    }
  };
}

/**
 * Wrap an action handler with timeout.
 */
export function withTimeout<TInput, TOutput>(
  handler: (input: TInput, context: ExecutionContext) => Promise<TOutput>,
  timeoutMs: number
): (input: TInput, context: ExecutionContext) => Promise<TOutput> {
  return async (input, context) => {
    const effectiveTimeout = context.timeout ?? timeoutMs;

    return Promise.race([
      handler(input, context),
      new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Action timed out after ${effectiveTimeout}ms`));
        }, effectiveTimeout);
      }),
    ]);
  };
}

/**
 * Compose multiple wrappers.
 */
export function compose<TInput, TOutput>(
  handler: (input: TInput, context: ExecutionContext) => Promise<TOutput>,
  ...wrappers: Array<
    (
      h: (input: TInput, context: ExecutionContext) => Promise<TOutput>
    ) => (input: TInput, context: ExecutionContext) => Promise<TOutput>
  >
): (input: TInput, context: ExecutionContext) => Promise<TOutput> {
  return wrappers.reduce((acc, wrapper) => wrapper(acc), handler);
}
