/**
 * Per-tenant EcommerceService registry
 *
 * Builds and caches one EcommerceService per tenant. If the tenant has an active
 * ecommerce module config with a medusaBaseUrl, a MedusaAdapter is wired in.
 * Otherwise the service falls back to the snapshot-store (Phase 1 behaviour).
 *
 * Call evictEcommerceService(tenantId) whenever the module config is updated.
 */

import { EcommerceService, createMedusaAdapter } from '@integrax/module-ecommerce';
import { findTenantModuleConfig } from '../../store/tenant-module-config.js';
import { snapshotStore, timelineStore } from './stores.js';
import { eventBus } from './event-bus.js';
import { registerModuleEviction } from '../module-eviction-registry.js';

const cache = new Map<string, EcommerceService>();

export async function getEcommerceService(tenantId: string): Promise<EcommerceService> {
  const cached = cache.get(tenantId);
  if (cached) return cached;

  const cfg = await findTenantModuleConfig(tenantId, 'ecommerce');
  const medusa = cfg?.status === 'active'
    ? createMedusaAdapter({
        medusaBaseUrl: cfg.config['medusaBaseUrl'] ?? '',
        medusaAdminApiKey: cfg.config['medusaAdminApiKey'] ?? '',
        tenantId,
      })
    : null;

  const svc = new EcommerceService(snapshotStore, eventBus, timelineStore, medusa);
  cache.set(tenantId, svc);
  return svc;
}

export function evictEcommerceService(tenantId: string): void {
  cache.delete(tenantId);
}

registerModuleEviction('ecommerce', evictEcommerceService);
