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
    const type = record.status === 'succeeded'
      ? 'operation.succeeded'
      : 'operation.failed';

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

  /**
   * Emitted when an operation enters 'awaiting_approval'.
   * Downstream subscribers (realtime, notification service) can use this
   * to alert the relevant approvers via WebSocket, email, or Slack.
   */
  async publishApprovalRequired(record: OperationRecord, approvalId: string): Promise<void> {
    await this.bus.publish({
      id: await getUlid(),
      type: 'operation.approval_required',
      tenantId: record.tenantId,
      sourceSystem: 'operation-engine',
      entityType: record.target.entityType ?? 'operation',
      entityId: record.operationId,
      occurredAt: new Date(),
      payload: {
        operationId: record.operationId,
        commandName: record.commandName,
        approvalId,
        reason: `Command '${record.commandName}' requires approval before execution`,
        actor: record.actor,
        target: record.target,
        status: 'awaiting_approval',
      },
    });
  }
}
