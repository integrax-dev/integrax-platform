/**
 * Activepieces bridge — subscribes to the IntegraX event bus and triggers
 * per-tenant Activepieces flows whenever a mapped event fires.
 *
 * Requires ACTIVEPIECES_BASE_URL + ACTIVEPIECES_API_KEY env vars.
 * If either is missing the bridge is skipped silently.
 */

import { eventBus } from './container/event-bus.js';
import { ActivepiecesAdapter } from '@integrax/integration-engine';
import type { IntegrationEngine } from '@integrax/integration-engine';
import { getActiveFlowMappingsByEvent } from '../store/tenant-flow-mappings.js';
import type { IntegraxEvent } from '@integrax/event-bus';

function buildAdapter(): IntegrationEngine | null {
  const url = process.env.ACTIVEPIECES_BASE_URL;
  const key = process.env.ACTIVEPIECES_API_KEY;
  if (!url || !key) return null;
  return new ActivepiecesAdapter(url, key);
}

export function registerActivepiecesBridge(): void {
  const adapter = buildAdapter();
  if (!adapter) return;

  eventBus.subscribeAll(async (event: IntegraxEvent) => {
    try {
      const mappings = await getActiveFlowMappingsByEvent(event.type);
      const relevant = mappings.filter(m => m.tenantId === event.tenantId);
      for (const m of relevant) {
        await adapter.triggerFlow({
          flowId: m.flowId,
          tenantId: m.tenantId,
          payload: { event },
        });
      }
    } catch (err) {
      console.error('[ActivepiecesBridge] Failed to trigger flow:', err);
    }
  }, { name: 'activepieces-bridge', catchErrors: false });
}
