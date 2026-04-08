/**
 * Event Publisher (operation-engine integration)
 *
 * Publishes typed events after an operation completes or changes status.
 */

import type { EventBus } from '@integrax/event-bus';
import type { OperationRecord } from '../core/operation.js';

let _ulid: (() => string) | undefined;
async function getUlid(): Promise<string> {
  if (!_ulid) {
    const mod = await import('@integrax/entities');
    _ulid = mod.ulid;
  }
  return _ulid!();
}

export class OperationEventPublisher {
  constructor(private readonly bus: EventBus) {}

  async publishOperationCompleted(record: OperationRecord): Promise<void> {
    const succeeded = record.status === 'succeeded';
    const type = succeeded ? 'workflow.completed' : 'workflow.failed';

    await this.bus.publish({
      id: await getUlid(),
      type,
      tenantId: record.tenantId,
      sourceSystem: 'operation-engine',
      entityType: record.target.entityType ?? 'operation',
      entityId: record.target.canonicalId ?? record.operationId,
      occurredAt: record.statusUpdatedAt,
      correlationId: record.correlationId,
      payload: {
        operationId: record.operationId,
        commandName: record.commandName,
        status: record.status,
        actor: record.actor,
        target: record.target,
        result: record.result,
        errors: record.errors,
      },
    });
  }

  async publishApprovalRequired(record: OperationRecord, approvalId: string): Promise<void> {
    await this.bus.publish({
      id: await getUlid(),
      type: 'workflow.started',
      tenantId: record.tenantId,
      sourceSystem: 'operation-engine',
      entityType: record.target.entityType ?? 'operation',
      entityId: record.operationId,
      occurredAt: new Date(),
      payload: {
        operationId: record.operationId,
        commandName: record.commandName,
        approvalId,
        status: 'awaiting_approval',
      },
    });
  }
}
