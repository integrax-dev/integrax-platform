/**
 * Timeline Writer
 *
 * Writes SyncTrace and EntityTrace entries to the timeline store.
 * The timeline is the human-inspectable audit trail — write here
 * after every sync run and every meaningful entity change.
 */

import type { TimelineStore } from '@integrax/timeline';
import type { EntitySnapshot } from '@integrax/snapshot-store';

export class TimelineWriter {
  constructor(private readonly timeline: TimelineStore) {}

  /** Written once per connector poll run, whether or not anything changed. */
  async writeSyncTrace(params: {
    tenantId: string;
    sourceSystem: string;
    entityType: string;
    trigger: 'poll' | 'webhook' | 'manual';
    recordsFetched: number;
    recordsChanged: number;
    cursor: string | null;
    cursorAfter: string | null;
    durationMs: number;
    error?: string;
  }): Promise<void> {
    await this.timeline.append(params.tenantId, {
      kind: 'sync',
      tenantId: params.tenantId,
      occurredAt: new Date(),
      sourceSystem: params.sourceSystem,
      trigger: params.trigger,
      entityType: params.entityType,
      recordsFetched: params.recordsFetched,
      recordsChanged: params.recordsChanged,
      cursor: params.cursor,
      cursorAfter: params.cursorAfter,
      durationMs: params.durationMs,
      error: params.error,
    });
  }

  /** Written for each entity that actually changed content (hash diff). */
  async writeEntityTrace(params: {
    tenantId: string;
    snapshot: EntitySnapshot;
    previousHash: string | null;
  }): Promise<void> {
    const { tenantId, snapshot, previousHash } = params;

    await this.timeline.append(tenantId, {
      kind: 'entity',
      tenantId,
      occurredAt: new Date(),
      entityType: snapshot.entityType,
      canonicalId: snapshot.canonicalId,
      sourceSystem: snapshot.sourceSystem,
      deltas: [],  // Fine-grained deltas computed by consistency-inspector
      previousHash,
      currentHash: snapshot.payloadHash,
      actor: 'connector',
    });
  }
}
