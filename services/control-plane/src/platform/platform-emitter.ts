/**
 * Platform Event Emitter — unified in-process event bus for SSE streaming.
 *
 * All server-side mutations (tenant CRUD, connector status, workflow updates,
 * schema drift, event processing) emit here. The GET /api/stream endpoint
 * subscribes to this emitter and forwards every event to all connected
 * admin-panel clients in real time.
 *
 * Event types are intentionally narrow — only events that are meaningful
 * to an operator watching the admin panel are included. Internal bookkeeping
 * (audit logging, metrics) stays in its own layer.
 *
 * One emitter per process. For multi-replica deployments, replace with a
 * Redis pub/sub adapter (same interface, drop-in swap).
 */

import { EventEmitter } from 'events';

// ─── Event type catalog ────────────────────────────────────────────────────────

export type PlatformEventType =
  // Tenants
  | 'tenant.created'
  | 'tenant.updated'
  | 'tenant.suspended'
  | 'tenant.activated'
  // Connectors
  | 'connector.created'
  | 'connector.updated'
  | 'connector.deleted'
  // Workflows
  | 'workflow.updated'
  // Platform events (jobs / queue)
  | 'event.processed'
  | 'event.failed'
  | 'event.dlq'
  // Schema drift incidents
  | 'incident.created'
  | 'incident.updated';

export interface PlatformEvent<T = unknown> {
  type: PlatformEventType;
  data: T;
  ts: string; // ISO-8601
}

// ─── Emitter singleton ─────────────────────────────────────────────────────────

export const platformEmitter = new EventEmitter();
platformEmitter.setMaxListeners(500); // one per SSE connection × event types

// ─── Typed emit helper ─────────────────────────────────────────────────────────

/**
 * Emit a typed platform event. All SSE clients will receive it immediately.
 * Fire-and-forget — never throws.
 */
export function emitPlatformEvent(type: PlatformEventType, data: unknown): void {
  const envelope: PlatformEvent = { type, data, ts: new Date().toISOString() };
  platformEmitter.emit(type, envelope);
}

// All event types as an array — used by the SSE route to subscribe/unsubscribe.
export const ALL_PLATFORM_EVENT_TYPES: PlatformEventType[] = [
  'tenant.created', 'tenant.updated', 'tenant.suspended', 'tenant.activated',
  'connector.created', 'connector.updated', 'connector.deleted',
  'workflow.updated',
  'event.processed', 'event.failed', 'event.dlq',
  'incident.created', 'incident.updated',
];
