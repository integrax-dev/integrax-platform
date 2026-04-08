/**
 * Polling Registration
 *
 * Auto-registers polling jobs from connector manifests.
 * Call registerFromManifests() at startup once the tenant's
 * connector credentials are known.
 *
 * Each (tenant, connector, entityType, cursorField) tuple becomes
 * one PollingScheduler job. The facade's listEntities() is the
 * polling surface.
 */

import type { PollingScheduler } from '@integrax/polling-scheduler';
import type { ConnectorManifestRegistry } from './connector-manifest-registry.js';
import type { IntegrationOrchestrator } from './orchestrator.js';

/** Default poll interval: 5 minutes. */
const DEFAULT_POLL_INTERVAL_MS = 5 * 60 * 1000;

export interface TenantConnectorCredentials {
  connectorId: string;
  credentials: Record<string, string>;
  /** Override the default poll interval for this connector. */
  pollIntervalMs?: number;
}

/**
 * Register all polling-capable connectors for a tenant.
 *
 * For each (connector, entityType, cursorField) combination in the
 * manifest, a PollingScheduler job is created. When the job fires,
 * it calls the orchestrator's processPollBatch().
 */
export async function registerTenantPolling(params: {
  tenantId: string;
  connectors: TenantConnectorCredentials[];
  registry: ConnectorManifestRegistry;
  scheduler: PollingScheduler;
  orchestrator: IntegrationOrchestrator;
}): Promise<void> {
  const { tenantId, connectors, registry, scheduler } = params;

  for (const { connectorId, credentials, pollIntervalMs } of connectors) {
    const registration = registry.getRegistration(connectorId);
    if (!registration?.manifest.polling_supported) continue;

    const { manifest } = registration;
    const facade = registration.createFacade(credentials, tenantId);

    const entityTypes = manifest.entities_supported ?? [];
    for (const entityType of entityTypes) {
      const entityManifest = manifest.entities?.[entityType];
      if (!entityManifest) continue;

      // Use the first cursor field declared in the manifest (entity-level
      // cursor_fields would override, but manifests don't have that yet).
      const cursorField = manifest.cursor_fields?.[0] ?? 'updatedAt';

      const jobId = `poll:${tenantId}:${connectorId}:${entityType}`;

      scheduler.register({
        jobId,
        tenantId,
        connectorId,
        entityType,
        cursorField,
        pollingIntervalMs: pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS,
        facade,
        // After each successful poll, the scheduler calls facade.listEntities()
        // and emits an event. We also hook into it via onPollResult below.
      });
    }
  }

  // Subscribe to poll events so the orchestrator processes each batch.
  // The polling-scheduler emits events to the event-bus; the orchestrator
  // subscribes via the bus — so we don't need explicit coupling here.
  // The control-plane container wires this subscription separately.
}
