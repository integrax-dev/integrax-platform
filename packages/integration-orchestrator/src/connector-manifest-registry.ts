/**
 * Connector Manifest Registry
 *
 * Holds the set of connectors the platform knows about.
 * The orchestrator reads manifests to understand entity shapes,
 * identity fields, polling support, and facade factories.
 *
 * This is the ONLY place in the codebase that should enumerate connectors.
 * Control-plane wires the registry at startup; the orchestrator reads it.
 */

import type { ConnectorManifest } from '@integrax/connector-sdk';
import type { ConnectorRegistration } from './types.js';

export class ConnectorManifestRegistry {
  private readonly registrations = new Map<string, ConnectorRegistration>();

  /**
   * Register a connector with its manifest and facade factory.
   * Call this once per connector at application startup.
   */
  register(registration: ConnectorRegistration): void {
    this.registrations.set(registration.connectorId, registration);
  }

  getManifest(connectorId: string): ConnectorManifest | undefined {
    return this.registrations.get(connectorId)?.manifest;
  }

  getRegistration(connectorId: string): ConnectorRegistration | undefined {
    return this.registrations.get(connectorId);
  }

  /** All connectors that expose at least one entity type via polling. */
  getPollingConnectors(): ConnectorRegistration[] {
    return [...this.registrations.values()].filter(
      r => r.manifest.polling_supported === true,
    );
  }

  /** All connectors that accept inbound webhooks. */
  getWebhookConnectors(): ConnectorRegistration[] {
    return [...this.registrations.values()].filter(
      r => r.manifest.webhooks_supported === true,
    );
  }

  /** Connectors that support a given entity type. */
  getEntityConnectors(entityType: string): ConnectorRegistration[] {
    return [...this.registrations.values()].filter(r =>
      r.manifest.entities_supported?.includes(entityType),
    );
  }

  all(): ConnectorRegistration[] {
    return [...this.registrations.values()];
  }
}
