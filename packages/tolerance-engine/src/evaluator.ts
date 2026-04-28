import type { TolerancePolicy, ToleranceEvaluationResult } from './types.js';

/**
 * Pure function. Applies a single tolerance policy to two numeric values.
 * Returns pass/fail and, on failure, the measured deviation vs threshold.
 */
export function evaluateTolerance(
  a: unknown,
  b: unknown,
  policy: TolerancePolicy | null,
): ToleranceEvaluationResult {
  // No policy ⇒ exact equality
  if (!policy || policy.strategy === 'exact') {
    const pass = a === b;
    if (pass) return { pass: true, policy };
    const deviation = typeof a === 'number' && typeof b === 'number' ? Math.abs(a - b) : NaN;
    return { pass: false, policy, deviation, threshold: 0 };
  }

  if (policy.strategy === 'always_pass') {
    return { pass: true, policy };
  }

  if (typeof a !== 'number' || typeof b !== 'number') {
    // Non-numeric: fall back to equality
    const pass = a === b;
    return pass
      ? { pass: true, policy }
      : { pass: false, policy, deviation: NaN, threshold: policy.value };
  }

  const diff = Math.abs(a - b);

  if (policy.strategy === 'absolute') {
    const pass = diff <= policy.value;
    return pass ? { pass: true, policy } : { pass: false, policy, deviation: diff, threshold: policy.value };
  }

  if (policy.strategy === 'relative') {
    const magnitude = Math.max(Math.abs(a), Math.abs(b));
    if (magnitude === 0) return { pass: true, policy };
    const ratio = diff / magnitude;
    const pass = ratio <= policy.value;
    return pass ? { pass: true, policy } : { pass: false, policy, deviation: ratio, threshold: policy.value };
  }

  if (policy.strategy === 'percentage') {
    const magnitude = Math.max(Math.abs(a), Math.abs(b));
    if (magnitude === 0) return { pass: true, policy };
    const pct = (diff / magnitude) * 100;
    const pass = pct <= policy.value;
    return pass ? { pass: true, policy } : { pass: false, policy, deviation: pct, threshold: policy.value };
  }

  // Unreachable — exhaustiveness guard
  return { pass: true, policy: null };
}
