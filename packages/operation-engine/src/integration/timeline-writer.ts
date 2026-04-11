/**
 * Timeline Writer (operation-engine integration)
 *
 * Writes operation lifecycle events to the timeline store.
 * Reuses the WorkflowTrace kind for operation runs —
 * each operation is treated as a single-step workflow.
 */

import type { TimelineStore } from '@integrax/timeline';
import type { OperationRecord } from '../core/operation.js';
import type { OperationError } from '../core/operation-error.js';

export class OperationTimelineWriter {
  constructor(private readonly timeline: TimelineStore) {}

  async writeOperationTrace(
    record: OperationRecord,
    durationMs: number,
    errors: OperationError[],
  ): Promise<void> {
    const succeeded = record.status === 'succeeded';
    const failed = record.status === 'failed' || record.status === 'rejected';

    await this.timeline.append(record.tenantId, {
      kind: 'workflow',
      tenantId: record.tenantId,
      occurredAt: record.requestedAt,
      flowId: `operation:${record.commandName}`,
      flowName: record.commandName,
      runId: record.operationId,
      triggerType: record.actor.type,
      status: succeeded ? 'success' : failed ? 'failed' : 'running',
      steps: [
        {
          stepId: 'execute',
          nodeType: record.commandName,
          status: succeeded ? 'success' : failed ? 'failed' : 'running',
          startedAt: record.requestedAt,
          completedAt: record.statusUpdatedAt,
          durationMs,
          error: errors[0]?.message,
        },
      ],
      startedAt: record.requestedAt,
      completedAt: record.statusUpdatedAt,
      durationMs,
      correlatedEntityType: record.target.entityType,
      correlatedEntityId: record.target.canonicalId,
    });
  }
}
