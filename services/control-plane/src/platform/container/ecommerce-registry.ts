/**
 * Per-tenant EcommerceService registry
 *
 * Builds and caches one EcommerceService per tenant. If the tenant has an active
 * ecommerce module config with a medusaBaseUrl, a MedusaAdapter is wired in.
 * Otherwise the service falls back to the snapshot-store (Phase 1 behaviour).
 *
 * Call evictEcommerceService(tenantId) whenever the module config is updated.
 */

import {
  EcommerceService,
  createMedusaAdapter,
  createTiendanubeAdapter,
  createShopifyAdapter,
  createVTEXAdapter,
} from '@integrax/module-ecommerce';
import type { EcommerceAdapter } from '@integrax/module-ecommerce';
import { findTenantModuleConfig } from '../../store/tenant-module-config.js';
import { snapshotStore, timelineStore } from './stores.js';
import { eventBus } from './event-bus.js';
import { registerModuleEviction } from '../module-eviction-registry.js';

const cache = new Map<string, EcommerceService>();

function buildAdapter(
  provider: string | undefined,
  config: Record<string, string>,
  tenantId: string,
): EcommerceAdapter | null {
  switch (provider) {
    case 'shopify':
      return createShopifyAdapter({
        shopDomain: config['shopDomain'] ?? '',
        accessToken: config['accessToken'] ?? '',
        apiVersion: config['apiVersion'],
        tenantId,
      });
    case 'tiendanube':
      return createTiendanubeAdapter({
        storeId: config['storeId'] ?? '',
        accessToken: config['accessToken'] ?? '',
        userAgent: config['userAgent'] ?? 'IntegraX (soporte@integrax.io)',
        tenantId,
      });
    case 'vtex':
      return createVTEXAdapter({
        account: config['account'] ?? '',
        appKey: config['appKey'] ?? '',
        appToken: config['appToken'] ?? '',
        environment: (config['environment'] as 'vtexcommercestable' | 'vtexcommercebeta') ?? undefined,
        tenantId,
      });
    case 'medusa':
    default:
      return createMedusaAdapter({
        medusaBaseUrl: config['medusaBaseUrl'] ?? '',
        medusaAdminApiKey: config['medusaAdminApiKey'] ?? '',
        tenantId,
      });
  }
}

export async function getEcommerceService(tenantId: string): Promise<EcommerceService> {
  const cached = cache.get(tenantId);
  if (cached) return cached;

  const cfg = await findTenantModuleConfig(tenantId, 'ecommerce');
  const adapter = cfg?.status === 'active'
    ? buildAdapter(cfg.config['provider'], cfg.config, tenantId)
    : null;

  const svc = new EcommerceService(snapshotStore, eventBus, timelineStore, adapter);
  cache.set(tenantId, svc);
  return svc;
}

export function evictEcommerceService(tenantId: string): void {
  cache.delete(tenantId);
}

registerModuleEviction('ecommerce', evictEcommerceService);
