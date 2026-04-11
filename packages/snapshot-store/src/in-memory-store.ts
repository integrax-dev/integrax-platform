import { compareEntities } from '@integrax/platform-kernel';
import type { ComparisonResult, ComparisonRule } from '@integrax/platform-kernel';
import type {
  EntitySnapshot,
  SnapshotFilter,
  SnapshotStore,
} from './types.js';

type StoreKey = string; // `${tenantId}:${entityType}:${canonicalId}:${sourceSystem}`

/**
 * Implementacion en memoria de SnapshotStore para tests y entornos simples.
 *
 * En produccion se reemplaza por una implementacion sobre Postgres que lea y
 * escriba la tabla `entity_snapshots` (ver `db/migrations/004_snapshots.sql`).
 */
export class InMemorySnapshotStore implements SnapshotStore {
  private readonly store = new Map<StoreKey, EntitySnapshot>();

  private key(
    tenantId: string,
    entityType: string,
    canonicalId: string,
    sourceSystem: string,
  ): StoreKey {
    return `${tenantId}:${entityType}:${canonicalId}:${sourceSystem}`;
  }

  async get(
    tenantId: string,
    entityType: string,
    canonicalId: string,
  ): Promise<EntitySnapshot | null> {
    // Devuelve el snapshot mas recientemente actualizado para este canonical ID.
    const all = await this.getAll(tenantId, entityType, canonicalId);
    if (all.length === 0) return null;
    return all.sort((a, b) => b.updatedAtSnapshot.getTime() - a.updatedAtSnapshot.getTime())[0];
  }

  async getAll(
    tenantId: string,
    entityType: string,
    canonicalId: string,
  ): Promise<EntitySnapshot[]> {
    const results: EntitySnapshot[] = [];
    for (const [k, v] of this.store) {
      if (k.startsWith(`${tenantId}:${entityType}:${canonicalId}:`)) {
        results.push(v);
      }
    }
    return results;
  }

  async upsert(snapshot: EntitySnapshot): Promise<void> {
    const k = this.key(
      snapshot.tenantId,
      snapshot.entityType,
      snapshot.canonicalId,
      snapshot.sourceSystem,
    );
    this.store.set(k, snapshot);
  }

  async list(
    tenantId: string,
    entityType: string,
    filter: SnapshotFilter = {},
  ): Promise<EntitySnapshot[]> {
    const results: EntitySnapshot[] = [];
    for (const [k, v] of this.store) {
      if (!k.startsWith(`${tenantId}:${entityType}:`)) continue;
      if (filter.sourceSystem && v.sourceSystem !== filter.sourceSystem) continue;
      if (filter.since && v.updatedAtSnapshot < filter.since) continue;
      results.push(v);
    }
    const sorted = results.sort(
      (a, b) => b.updatedAtSnapshot.getTime() - a.updatedAtSnapshot.getTime(),
    );
    return filter.limit ? sorted.slice(0, filter.limit) : sorted;
  }

  diff(
    a: EntitySnapshot,
    b: EntitySnapshot,
    rules?: ComparisonRule[],
  ): ComparisonResult {
    return compareEntities(a.payload, b.payload, rules);
  }
}
