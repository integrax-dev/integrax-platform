/**
 * useDriftStream — fetch-based SSE hook for real-time drift incident updates.
 *
 * Uses fetch + ReadableStream instead of native EventSource so that the
 * Authorization: Bearer header can be sent (EventSource doesn't allow custom headers).
 *
 * Events emitted by the server:
 *   incident.created  — new drift incident detected
 *   incident.updated  — existing incident refreshed (dedup path)
 *
 * Reconnect: exponential backoff (1s → 2s → 4s … cap 30s) with jitter.
 * Cleans up on unmount (aborts the fetch and clears the timer).
 */

import { useEffect, useRef, useCallback } from 'react';
import { buildAdminApiUrl } from './runtime';

export type SSEDriftEvent = 'incident.created' | 'incident.updated';

export interface UseDriftStreamOptions {
  /** Called whenever a drift incident SSE event arrives. */
  onEvent: (type: SSEDriftEvent, data: unknown) => void;
  /** Token getter — same as the one registered with setTokenGetter. */
  getToken: () => string | null;
  /** Set to false to skip connecting (e.g. while loading). Default true. */
  enabled?: boolean;
}

const BASE_DELAY_MS = 1_000;
const MAX_DELAY_MS  = 30_000;

export function useDriftStream({ onEvent, getToken, enabled = true }: UseDriftStreamOptions): void {
  const abortRef   = useRef<AbortController | null>(null);
  const timerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const delayRef   = useRef(BASE_DELAY_MS);
  const onEventRef = useRef(onEvent);
  const mountedRef = useRef(false);
  onEventRef.current = onEvent; // keep stable without restarting the effect

  const connect = useCallback(() => {
    if (!mountedRef.current) return;

    const token = getToken();
    const ctrl  = new AbortController();
    abortRef.current = ctrl;

    const headers: Record<string, string> = { Accept: 'text/event-stream' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const url = buildAdminApiUrl('/api/drift/stream');

    const scheduleReconnect = () => {
      if (!mountedRef.current) return;
      // Jitter ±20%
      const jitter = 1 + (Math.random() * 0.4 - 0.2);
      const delay  = Math.min(delayRef.current * jitter, MAX_DELAY_MS);
      delayRef.current = Math.min(delayRef.current * 2, MAX_DELAY_MS);
      timerRef.current = setTimeout(() => {
        if (mountedRef.current) connect();
      }, delay);
    };

    (async () => {
      try {
        const res = await fetch(url, { headers, signal: ctrl.signal });

        if (!res.ok || !res.body) {
          scheduleReconnect();
          return;
        }

        // Connection succeeded — reset backoff
        delayRef.current = BASE_DELAY_MS;

        const reader  = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          // SSE messages are separated by double newlines
          const blocks = buffer.split('\n\n');
          buffer = blocks.pop() ?? ''; // last element may be incomplete

          for (const block of blocks) {
            const lines  = block.split('\n');
            let eventType = '';
            let dataLine  = '';

            for (const line of lines) {
              if (line.startsWith('event: ')) {
                eventType = line.slice(7).trim();
              } else if (line.startsWith('data: ')) {
                dataLine = line.slice(6).trim();
              }
              // heartbeat comments (: heartbeat) are silently skipped
            }

            if (eventType && dataLine) {
              try {
                const parsed = JSON.parse(dataLine);
                if (eventType === 'incident.created' || eventType === 'incident.updated') {
                  onEventRef.current(eventType as SSEDriftEvent, parsed);
                }
              } catch {
                // malformed JSON — ignore
              }
            }
          }
        }
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          // Intentional unmount abort — don't reconnect
          return;
        }
      }

      // Stream ended unexpectedly (server restart / proxy timeout) — reconnect
      scheduleReconnect();
    })();
  }, [getToken]);

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
