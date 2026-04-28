import type { ConsistencySignal } from './types.js';

/**
 * Computes a stable deduplication key for a signal.
 * Deterministic: same logical event always produces the same key.
 */
export function computeDeduplicationKey(opts: {
  tenantId: string;
  kind: ConsistencySignal['kind'];
  entityType: string;
  entityId?: string;
  fieldPath?: string;
  connectorA: string;
  connectorB?: string;
}): string {
  const parts = [
    opts.tenantId,
    opts.kind,
    opts.entityType,
    opts.entityId ?? '',
    opts.fieldPath ?? '',
    [opts.connectorA, opts.connectorB ?? ''].sort().join(':'),
  ];
  return parts.join('|');
}

/**
 * Deduplication window: signals with the same key occurring within this
 * many milliseconds of each other are treated as the same signal.
 */
export const DEDUP_WINDOW_MS = 60_000; // 1 minute
