/**
 * Thin shim — bridges the legacy `emitPlatformEvent(type, payload)` call-sites
 * to the typed EventBus. All SSE clients receive these events via
 * `eventBus.subscribeAll()` in routes/stream.ts.
 */

import { ulid } from 'ulid';
import { eventBus } from './container/event-bus.js';
import type { IntegraxEventType } from '@integrax/event-bus';

export function emitPlatformEvent(type: string, payload: unknown): void {
  const p = payload as Record<string, unknown> | null | undefined;
  eventBus.publish({
    id: ulid(),
    type: type as IntegraxEventType,
    tenantId: (p?.['tenantId'] as string) ?? 'platform',
    sourceSystem: 'control-plane',
    entityType: type.split('.')[0] ?? 'unknown',
    entityId: (p?.['id'] as string) ?? undefined,
    payload: payload ?? {},
    occurredAt: new Date(),
  }).catch(() => {});
}
