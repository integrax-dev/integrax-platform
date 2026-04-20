/**
 * Activepieces bridge — two delivery modes:
 *
 * 1. Flow ID mappings (Postgres): event fires → adapter.triggerFlow(flowId)
 *    Configured via PUT /api/tenants/:tenantId/flow-mappings/:eventType
 *    Requires ACTIVEPIECES_BASE_URL + ACTIVEPIECES_API_KEY.
 *
 * 2. Webhook trigger subscriptions (Postgres): event fires → POST callbackUrl
 *    Configured via POST /api/tenants/:tenantId/trigger-subscriptions
 *    Used by Activepieces native piece triggers (onEnable/onDisable lifecycle).
 *    No ACTIVEPIECES_* env vars required — just HTTP.
 */

import { eventBus } from './container/event-bus.js';
import { ActivepiecesAdapter } from '@integrax/integration-engine';
import type { IntegrationEngine } from '@integrax/integration-engine';
import { getActiveFlowMappingsByEvent } from '../store/tenant-flow-mappings.js';
import { getSubscriptionsByEvent } from '../store/webhook-trigger-subscriptions.js';
import type { IntegraxEvent } from '@integrax/event-bus';

function buildAdapter(): IntegrationEngine | null {
  const rawUrl = process.env.ACTIVEPIECES_BASE_URL;
  const key = process.env.ACTIVEPIECES_API_KEY;
  if (!rawUrl || !key) return null;

  const trimmed = rawUrl.replace(/\/$/, '');
  const baseUrl = trimmed.endsWith('/api') ? trimmed : `${trimmed}/api`;

  return new ActivepiecesAdapter(baseUrl, key);
}

async function fanoutWebhookSubscribers(event: IntegraxEvent): Promise<void> {
  const subs = await getSubscriptionsByEvent(event.type);
  const relevant = subs.filter(s => s.tenantId === event.tenantId);
  if (relevant.length === 0) return;

  await Promise.allSettled(
    relevant.map(sub =>
      fetch(sub.callbackUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(sub.secret ? { 'X-IntegraX-Secret': sub.secret } : {}),
        },
        body: JSON.stringify({ eventType: event.type, tenantId: event.tenantId, payload: event }),
      }).catch(err => {
        console.error(`[ActivepiecesBridge] Webhook fanout failed for ${sub.callbackUrl}:`, err);
      }),
    ),
  );
}

export function registerActivepiecesBridge(): void {
  const adapter = buildAdapter();

  eventBus.subscribeAll(async (event: IntegraxEvent) => {
    await Promise.allSettled([
      // Mode 1: flow ID mappings (requires Activepieces adapter)
      adapter
        ? (async () => {
            const mappings = await getActiveFlowMappingsByEvent(event.type);
            const relevant = mappings.filter(m => m.tenantId === event.tenantId);
            for (const m of relevant) {
              await adapter.triggerFlow({ flowId: m.flowId, tenantId: m.tenantId, payload: { event } });
            }
          })().catch(err => console.error('[ActivepiecesBridge] Flow trigger failed:', err))
        : Promise.resolve(),

      // Mode 2: webhook subscriptions (native Activepieces piece triggers)
      fanoutWebhookSubscribers(event).catch(err =>
        console.error('[ActivepiecesBridge] Webhook fanout error:', err),
      ),
    ]);
  }, { name: 'activepieces-bridge', catchErrors: true });
}
