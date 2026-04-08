/**
 * Facade Resolver
 *
 * Resolves a facade for a given (connectorId, tenantId) pair.
 * Facades are registered at startup with a factory function; the factory
 * is called once per (tenantId, connectorId) and the result is cached.
 */

import type { DispatchableFacade } from '../execution/dispatcher.js';

export type FacadeFactory = (
  credentials: Record<string, string>,
  tenantId: string,
) => DispatchableFacade;

export interface FacadeRegistration {
  connectorId: string;
  factory: FacadeFactory;
}

export type CredentialProvider = (
  tenantId: string,
  connectorId: string,
) => Record<string, string> | undefined;

export class FacadeResolver {
  private readonly factories = new Map<string, FacadeFactory>();
  private readonly cache = new Map<string, DispatchableFacade>();

  constructor(private readonly credentialProvider: CredentialProvider) {}

  register(connectorId: string, factory: FacadeFactory): void {
    this.factories.set(connectorId, factory);
  }

  resolve(connectorId: string, tenantId: string): DispatchableFacade | undefined {
    const cacheKey = `${tenantId}:${connectorId}`;
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    const factory = this.factories.get(connectorId);
    if (!factory) return undefined;

    const credentials = this.credentialProvider(tenantId, connectorId);
    if (!credentials) return undefined;

    const facade = factory(credentials, tenantId);
    this.cache.set(cacheKey, facade);
    return facade;
  }

  /** Clear cached facades for a tenant (e.g. on credential rotation). */
  evict(tenantId: string): void {
    for (const key of this.cache.keys()) {
      if (key.startsWith(`${tenantId}:`)) {
        this.cache.delete(key);
      }
    }
  }
}
