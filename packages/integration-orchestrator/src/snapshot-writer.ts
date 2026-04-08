/**
 * Snapshot Writer
 *
 * Persists a canonicalized entity to the SnapshotStore and returns
 * whether the content changed (hash diff). Callers use the return
 * value to decide whether to publish events and write timeline traces.
 */

import { ulid } from '@integrax/entities';
import { hashPayload } from '@integrax/snapshot-store';
import type { SnapshotStore, EntitySnapshot } from '@integrax/snapshot-store';
import type { CanonicalizedEntity } from './types.js';

export class SnapshotWriter {
  constructor(private readonly store: SnapshotStore) {}

  /**
   * Upsert a snapshot for the given entity.
   *
   * Returns `{ snapshot, changed }` where `changed` is true when the
   * payload hash differs from the previous snapshot for this
   * (tenant, entityType, canonicalId, sourceSystem) tuple.
   */
  async write(
    tenantId: string,
    entity: CanonicalizedEntity,
  ): Promise<{ snapshot: EntitySnapshot; changed: boolean }> {
    const previous = await this.store.get(
      tenantId,
      entity.entityType,
      entity.canonicalId,
    );

    const payloadHash = hashPayload(entity.payload);
    const changed = previous === null || previous.payloadHash !== payloadHash;

    const snapshot: EntitySnapshot = {
      snapshotId: previous?.snapshotId ?? ulid(),
      tenantId,
      entityType: entity.entityType,
      canonicalId: entity.canonicalId,
      externalIds: entity.externalIds,
      payloadHash,
      payload: entity.payload,
      sourceSystem: entity.sourceSystem,
      updatedAtSource: entity.updatedAt,
      updatedAtSnapshot: new Date(),
    };

    await this.store.upsert(snapshot);

    return { snapshot, changed };
  }
}
