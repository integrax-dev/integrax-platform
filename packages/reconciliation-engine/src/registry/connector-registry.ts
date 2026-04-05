/**
 * ConnectorRegistry
 *
 * In-memory registry of ConnectorManifests.
 * Manifests are injected at construction — the registry does not know
 * where they come from (monorepo, external config, remote fetch, etc.).
 *
 * In the IntegraX monorepo, the control-plane imports connector manifests
 * and passes them here at startup. An external customer does the same
 * with their own manifest objects.
 *
 * Zero external dependencies — accepts any object matching ConnectorManifestShape.
 */

import type { ConnectorManifestShape, EntityManifestShape } from '../shared/manifest.js';

export { ConnectorManifestShape, EntityManifestShape };

export class ConnectorRegistry {
  private readonly manifests: Map<string, ConnectorManifestShape>;

  constructor(manifests: ConnectorManifestShape[]) {
    this.manifests = new Map(manifests.map(m => [m.service, m]));
  }

  getManifest(service: string): ConnectorManifestShape | undefined {
    return this.manifests.get(service);
  }

  getEntityConfig(service: string, entity: string): EntityManifestShape | undefined {
    return this.manifests.get(service)?.entities?.[entity];
  }

  listServices(): string[] {
    return Array.from(this.manifests.keys());
  }

  servicesWithEntity(entity: string): string[] {
    return this.listServices().filter(s => this.getEntityConfig(s, entity) !== undefined);
  }

  /** All drift endpoints per service — consumed by watchdog config generation */
  allDriftEndpoints(): Record<string, string[]> {
    const result: Record<string, string[]> = {};
    for (const [service, manifest] of this.manifests) {
      if (manifest.drift?.endpoints.length) {
        result[service] = manifest.drift.endpoints;
      }
    }
    return result;
  }
}
