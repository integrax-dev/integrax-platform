/**
 * Persisting Identity Resolver
 *
 * Wraps IdentityResolver so that:
 *  1. On creation: loads existing aliases from Postgres (async init, best-effort)
 *  2. On new alias registration: fire-and-forgets a Postgres write
 *
 * Uses the identity_aliases table from migration 007.
 */

import { IdentityResolver } from '@integrax/platform-kernel';
import { identityAliasStore } from './stores.js';

/**
 * Extends IdentityResolver to persist new aliases to Postgres.
 * The `entityType` is unknown at `registerAlias` call time so we store
 * a placeholder ('unknown') and update it when the orchestrator has context.
 */
class PersistingIdentityResolver extends IdentityResolver {
  constructor(private readonly tenantId: string) {
    super();
  }

  override registerAlias(canonicalId: string, system: string, externalId: string): void {
    super.registerAlias(canonicalId, system, externalId);
    // Fire-and-forget: don't block the sync canonicalization pipeline
    void identityAliasStore.save({
      canonicalId,
      tenantId: this.tenantId,
      sourceSystem: system,
      externalId,
      entityType: 'unknown',
    }).catch((err) => {
      console.error('[identity] Failed to persist alias', { tenantId: this.tenantId, canonicalId, system, err });
    });
  }
}

/**
 * Factory for the integration orchestrator's resolverFactory option.
 * Lazily loads existing aliases for each tenant the first time a resolver
 * is created for that tenant.
 */
export function createResolverFactory(): (tenantId: string) => IdentityResolver {
  return (tenantId: string) => {
    const resolver = new PersistingIdentityResolver(tenantId);

    // Load existing aliases in the background; the resolver starts empty and fills up.
    // Requests that arrive before loading completes use only in-flight aliases.
    identityAliasStore.list(tenantId).then((aliases) => {
      const grouped = new Map<string, { externalIds: Array<{ system: string; id: string }> }>();
      for (const alias of aliases) {
        const entry = grouped.get(alias.canonicalId) ?? { externalIds: [] };
        entry.externalIds.push({ system: alias.sourceSystem, id: alias.externalId });
        grouped.set(alias.canonicalId, entry);
      }
      resolver.loadAliases(
        [...grouped.entries()].map(([canonicalId, { externalIds }]) => ({
          canonicalId,
          externalIds,
          registeredAt: new Date(),
        })),
      );
    }).catch((err) => {
      console.error('[identity] Failed to load aliases for tenant', { tenantId, err });
    });

    return resolver;
  };
}
