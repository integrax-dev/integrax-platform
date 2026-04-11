/**
 * Snapshot Updater
 *
 * Updates the snapshot store after a successful operation mutates entity state.
 * Only called for operations that produce an updated entity payload.
 *
 * The orchestrator (webhook/poll path) owns snapshot writes for inbound data.
 * This writer handles the outbound command path.
 */

import { createHash } from 'node:crypto';
import type { SnapshotStore, EntitySnapshot } from '@integrax/snapshot-store';
import type { OperationRecord } from '../core/operation.js';

let _ulid: (() => string) | undefined;
async function getUlid(): Promise<string> {
  if (!_ulid) {
    const mod = await import('@integrax/entities');
    _ulid = mod.ulid;
  }
  return _ulid!();
}

function hashPayload(payload: Record<string, unknown>): string {
  const normalized = JSON.stringify(payload, Object.keys(payload).sort());
  return createHash('sha256').update(normalized).digest('hex');
}

export class SnapshotUpdater {
  constructor(private readonly store: SnapshotStore) {}

  /**
   * Write a snapshot for the result of a successful operation.
   * Only writes if the operation result contains an updated entity payload.
   */
  async update(record: OperationRecord): Promise<void> {
    if (!record.target.entityType || !record.target.canonicalId) return;
    if (!record.result || typeof record.result !== 'object') return;

    const result = record.result as Record<string, unknown>;
    // Expect operation result to have a 'payload' field with the updated entity
    const updatedPayload = (result['payload'] ?? result) as Record<string, unknown>;
    if (!updatedPayload || typeof updatedPayload !== 'object') return;

    const snapshot: EntitySnapshot = {
      snapshotId: await getUlid(),
      tenantId: record.tenantId,
      entityType: record.target.entityType,
      canonicalId: record.target.canonicalId,
      externalIds: record.target.externalIds ?? [],
      payloadHash: hashPayload(updatedPayload),
      payload: updatedPayload,
      sourceSystem: record.target.connectorId ?? record.target.systemId ?? 'operation-engine',
      updatedAtSource: record.statusUpdatedAt,
      updatedAtSnapshot: new Date(),
    };

    await this.store.upsert(snapshot);
  }
}
