/**
 * usePlatformStream — generic fetch-based SSE hook for the unified /api/stream endpoint.
 *
 * Connects once to GET /api/stream and routes incoming events to typed handlers.
 * Uses fetch + ReadableStream so Authorization: Bearer works (EventSource doesn't
 * support custom headers).
 *
 * Each handler receives the full PlatformEvent envelope: { type, data, ts }.
 *
 * Reconnect: exponential backoff (1s → 2s → 4s … cap 30s) with ±20% jitter.
 * Multiple components in the same page should share one hook instance —
 * just pass all handlers in a single `handlers` map.
 *
 * Usage:
 *   usePlatformStream({
 *     getToken: () => useAuthStore.getState().token,
 *     handlers: {
 *       'tenant.created': (env) => setTenants(prev => [env.data, ...prev]),
 *       'tenant.suspended': (env) => updateTenantStatus(env.data.id, 'suspended'),
 *     },
 *   });
 */

import { useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import { buildAdminApiUrl } from './runtime';

// ─── Types ─────────────────────────────────────────────────────────────────────

export type PlatformEventType =
  | 'tenant.created' | 'tenant.updated' | 'tenant.suspended' | 'tenant.activated'
  | 'connector.created' | 'connector.updated' | 'connector.deleted' | 'connector.health.changed'
  | 'workflow.updated'
  | 'event.processed' | 'event.failed' | 'event.dlq'
  | 'incident.created' | 'incident.updated'
  | 'schema.drift.detected' | 'schema.drift.high_impact' | 'schema.drift.critical' | 'schema.compatibility.breaking' | 'schema.drift.resolved' | 'schema.diff.detected'
  | 'schema.mapping.predicted' | 'schema.mapping.accepted' | 'schema.mapping.rejected'
  | 'reconciliation.conflict.detected' | 'reconciliation.conflict.resolved' | 'reconciliation.conflict.escalated' | 'reconciliation.approval.required' | 'reconciliation.approved' | 'reconciliation.rejected' | 'reconciliation.clean'
  | 'operation.submitted' | 'operation.succeeded' | 'operation.failed' | 'operation.approval_required' | 'operation.approved' | 'operation.rejected' | 'operation.retry.requested' | 'operation.replayed'
  | 'activepieces.flow.started' | 'activepieces.flow.failed'
  | 'audit.security.warning'
  | 'dlq.entry.created';

export interface SanitizedPlatformEvent {
  tenantId: string;
  eventType: PlatformEventType;
  sourceSystem?: string;
  runtime?: string;
  connectorId?: string;
  entityType?: string;
  correlationId?: string;
  severity?: string;
  status?: string;
  latencyMs?: number;
  counts?: number;
  confidence?: number;
  errorCode?: string;
  fingerprint?: string;
  hash?: string;
  createdAt: string;
  metadata?: Record<string, any>;
}

export type PlatformEventHandlers = {
  [K in PlatformEventType]?: (envelope: SanitizedPlatformEvent) => void;
};

export interface UsePlatformStreamOptions {
  /** Map of event type → handler. Stable reference not required — updated via ref. */
  handlers: PlatformEventHandlers;
  /** Token getter — call useAuthStore.getState().token inside. */
  getToken: () => string | null;
  /** Set false to pause (e.g. logged out). Default: true. */
  enabled?: boolean;
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const BASE_DELAY_MS = 1_000;
const MAX_DELAY_MS  = 30_000;
const SSE_URL       = '/api/stream';

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function usePlatformStream({
  handlers,
  getToken,
  enabled = true,
}: UsePlatformStreamOptions): void {
  const abortRef    = useRef<AbortController | null>(null);
  const timerRef    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const delayRef    = useRef(BASE_DELAY_MS);
  const mountedRef  = useRef(false);
  // Keep handlers ref fresh so reconnect loop always calls latest closures
  const handlersRef = useRef(handlers);
  // connectRef breaks the circular self-reference inside scheduleReconnect
  const connectRef  = useRef<(() => void) | null>(null);

  const connect = useCallback(() => {
    if (!mountedRef.current) return;

    const token = getToken();
    const ctrl  = new AbortController();
    abortRef.current = ctrl;

    const headers: Record<string, string> = { Accept: 'text/event-stream' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const url = buildAdminApiUrl(SSE_URL);

    const scheduleReconnect = () => {
      if (!mountedRef.current) return;
      const jitter = 1 + (Math.random() * 0.4 - 0.2);
      const delay  = Math.min(delayRef.current * jitter, MAX_DELAY_MS);
      delayRef.current = Math.min(delayRef.current * 2, MAX_DELAY_MS);
      timerRef.current = setTimeout(() => {
        if (mountedRef.current) connectRef.current?.();
      }, delay);
    };

    (async () => {
      try {
        const res = await fetch(url, { headers, signal: ctrl.signal });

        if (!res.ok || !res.body) {
          scheduleReconnect();
          return;
        }

        delayRef.current = BASE_DELAY_MS; // reset backoff on success

        const reader  = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          // SSE blocks separated by double newlines
          const blocks = buffer.split('\n\n');
          buffer = blocks.pop() ?? '';

          for (const block of blocks) {
            if (!block.trim()) continue;

            let eventType = '';
            let dataLine  = '';

            for (const line of block.split('\n')) {
              if (line.startsWith('event: ')) eventType = line.slice(7).trim();
              else if (line.startsWith('data: ')) dataLine = line.slice(6).trim();
              // ': heartbeat' comments are silently ignored
            }

            if (!eventType || !dataLine) continue;

            try {
              const envelope = JSON.parse(dataLine) as SanitizedPlatformEvent;
              const handler = handlersRef.current[eventType as PlatformEventType];
              handler?.(envelope);
            } catch {
              // malformed JSON — skip
            }
          }
        }
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
      }

      scheduleReconnect();
    })();
  }, [getToken]);

  // Sync both refs after every render — useLayoutEffect avoids mutating during render
  useLayoutEffect(() => {
    handlersRef.current = handlers;
    connectRef.current  = connect;
  });

  useEffect(() => {
    if (!enabled) return;

    mountedRef.current = true;
    delayRef.current = BASE_DELAY_MS;
    connect();

    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [enabled, connect]);
}
