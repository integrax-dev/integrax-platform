/**
 * Module eviction registry
 *
 * Modules with per-tenant caches register their eviction function here.
 * Routes call evictModule(moduleId, tenantId) without knowing which modules exist.
 *
 * To register: call registerModuleEviction() at module load time (side-effect import).
 */

const evictors = new Map<string, (tenantId: string) => void>();

export function registerModuleEviction(moduleId: string, evict: (tenantId: string) => void): void {
  evictors.set(moduleId, evict);
}

export function evictModule(moduleId: string, tenantId: string): void {
  evictors.get(moduleId)?.(tenantId);
}
