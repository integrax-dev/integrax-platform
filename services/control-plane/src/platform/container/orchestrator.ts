/**
 * Integration Orchestrator + Polling Scheduler
 *
 * Closes the runtime loop:
 *   webhook / poll → manifest lookup → canonicalize → snapshot upsert
 *   → event publish → timeline write
 */

import {
  IntegrationOrchestrator,
  registerTenantPolling,
} from '@integrax/integration-orchestrator';
import { PollingScheduler } from '@integrax/polling-scheduler';
import { connectorRegistry } from './connectors.js';
import { snapshotStore, timelineStore } from './stores.js';
import { eventBus } from './event-bus.js';
import { createResolverFactory } from './identity.js';

export const pollingScheduler = new PollingScheduler(eventBus);

export const orchestrator = new IntegrationOrchestrator(connectorRegistry, {
  snapshotStore,
  eventBus,
  timelineStore,
  scheduler: pollingScheduler,
  resolverFactory: createResolverFactory(),
});

// ─── Webhook → Orchestrator subscription ─────────────────────────────────────
// Handles both webhook-ingestion shape: { raw, entityType }
// and polling-scheduler shape: the record itself.

eventBus.subscribe('webhook.received', async (event) => {
  const raw = event.payload;
  if (!raw || typeof raw !== 'object') return;
  const p = raw as Record<string, unknown>;
  const record = (p['raw'] as Record<string, unknown>) ?? p;
  const entityType = (p['entityType'] as string) ?? event.entityType;
  if (!entityType) return;
  await orchestrator.processWebhookItem(
    event.sourceSystem,
    entityType,
    record,
    event.tenantId,
  );
});

export { registerTenantPolling };
