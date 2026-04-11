/**
 * Timeout Policy
 *
 * Wraps an async operation with a deadline. On timeout, returns a TIMEOUT error
 * rather than letting the promise hang.
 */

import { makeError, type OperationError } from '../core/operation-error.js';

/** Default operation timeout: 30 seconds. */
export const DEFAULT_TIMEOUT_MS = 30_000;

export interface TimeoutResult<T> {
  value?: T;
  timedOut: boolean;
  error?: OperationError;
}

export async function withTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<TimeoutResult<T>> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`Operation timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    const value = await Promise.race([fn(), timeout]);
    clearTimeout(timer);
    return { value, timedOut: false };
  } catch (err) {
    clearTimeout(timer);
    const isTimeout = err instanceof Error && err.message.startsWith('Operation timed out');
    return {
      timedOut: isTimeout,
      error: makeError(
        isTimeout ? 'TIMEOUT' : 'EXECUTION_FAILED',
        err instanceof Error ? err.message : String(err),
        'execution',
        { retryable: !isTimeout, cause: err },
      ),
    };
  }
}
