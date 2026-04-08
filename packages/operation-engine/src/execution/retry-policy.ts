/**
 * Retry Policy
 *
 * Determines if and when a failed operation should be retried.
 * Exponential backoff with jitter. Non-retryable errors skip immediately.
 */

import type { OperationError } from '../core/operation-error.js';

export interface RetryPolicy {
  /** Maximum number of attempts (including the first). Default: 3. */
  maxAttempts: number;
  /** Base delay in ms before the first retry. Default: 1000ms. */
  baseDelayMs: number;
  /** Multiplier applied after each failure. Default: 2. */
  backoffMultiplier: number;
  /** Maximum delay between attempts. Default: 30000ms. */
  maxDelayMs: number;
}

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 3,
  baseDelayMs: 1_000,
  backoffMultiplier: 2,
  maxDelayMs: 30_000,
};

export const NO_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 1,
  baseDelayMs: 0,
  backoffMultiplier: 1,
  maxDelayMs: 0,
};

export interface RetryDecision {
  shouldRetry: boolean;
  delayMs: number;
  retryAt: Date;
}

export function shouldRetry(
  error: OperationError,
  attemptCount: number,
  policy: RetryPolicy = DEFAULT_RETRY_POLICY,
): RetryDecision {
  if (!error.retryable || attemptCount >= policy.maxAttempts) {
    return { shouldRetry: false, delayMs: 0, retryAt: new Date() };
  }

  const base = policy.baseDelayMs * Math.pow(policy.backoffMultiplier, attemptCount - 1);
  // ±20% jitter
  const jitter = base * 0.2 * (Math.random() * 2 - 1);
  const delayMs = Math.min(Math.max(0, base + jitter), policy.maxDelayMs);
  const retryAt = new Date(Date.now() + delayMs);

  return { shouldRetry: true, delayMs, retryAt };
}
