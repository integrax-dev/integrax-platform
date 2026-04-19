/**
 * OperationEngine
 *
 * The single entry point for all operation submissions.
 *
 * Lifecycle:
 *   submit(request)
 *     → preflight + permission + capability + state validation
 *     → idempotency dedup
 *     → approval gate (if required)
 *     → plan
 *     → before-execute hooks
 *     → execute (with timeout + retry)
 *     → after-execute hooks / on-failure hooks
 *     → snapshot update
 *     → event publish
 *     → timeline write
 *     → return OperationResult
 */

import { createHash } from 'node:crypto';
import type { OperationRequest, OperationRecord, OperationResult } from '../core/operation.js';
import type { CommandRegistry } from '../core/command.js';
import type { OperationStore } from '../storage/operation-store.js';
import type { OperationAttemptStore } from '../storage/operation-attempt-store.js';
import type { ApprovalStore } from '../storage/approval-store.js';
import type { Validator } from '../validation/validator.js';
import { Planner } from './planner.js';
import { Executor } from './executor.js';
import { Dispatcher } from './dispatcher.js';
import { ApprovalPolicy } from '../approvals/approval-policy.js';
import { ApprovalService } from '../approvals/approval-service.js';
import { InMemoryIdempotencyStore, DEFAULT_IDEMPOTENCY_TTL_MS, type IdempotencyStore } from '../core/idempotency.js';
import { OperationTimelineWriter } from '../integration/timeline-writer.js';
import { OperationEventPublisher } from '../integration/event-publisher.js';
import { SnapshotUpdater } from '../integration/snapshot-updater.js';
import { runBeforeExecuteHooks, type BeforeExecuteHook } from '../hooks/before-execute.js';
import { runAfterExecuteHooks, type AfterExecuteHook } from '../hooks/after-execute.js';
import { runOnFailureHooks, type OnFailureHook } from '../hooks/on-failure.js';
import { makeError } from '../core/operation-error.js';
import { isTerminal } from '../core/operation-status.js';
import type { RetryPolicy } from './retry-policy.js';
import type { DispatcherConfig } from './dispatcher.js';
import type { TimelineStore } from '@integrax/timeline';
import type { EventBus } from '@integrax/event-bus';
import type { SnapshotStore } from '@integrax/snapshot-store';

let _ulid: (() => string) | undefined;
async function getUlid(): Promise<string> {
  if (!_ulid) {
    const mod = await import('@integrax/entities');
    _ulid = mod.ulid;
  }
  return _ulid!();
}

export interface OperationEngineConfig {
  commandRegistry: CommandRegistry;
  validator: Validator;
  operationStore: OperationStore;
  attemptStore: OperationAttemptStore;
  approvalStore: ApprovalStore;
  snapshotStore: SnapshotStore;
  eventBus: EventBus;
  timelineStore: TimelineStore;
  dispatcher: DispatcherConfig;
  approvalPolicy?: ApprovalPolicy;
  idempotencyStore?: IdempotencyStore;
  retryPolicy?: RetryPolicy;
  hooks?: {
    beforeExecute?: BeforeExecuteHook[];
    afterExecute?: AfterExecuteHook[];
    onFailure?: OnFailureHook[];
  };
}

export class OperationEngine {
  private readonly planner = new Planner();
  private readonly executor: Executor;
  private readonly dispatcher: Dispatcher;
  private readonly approvalPolicy: ApprovalPolicy;
  private readonly approvalService: ApprovalService;
  private readonly idempotencyStore: IdempotencyStore;
  private readonly timelineWriter: OperationTimelineWriter;
  private readonly eventPublisher: OperationEventPublisher;
  private readonly snapshotUpdater: SnapshotUpdater;

  constructor(private readonly config: OperationEngineConfig) {
    this.dispatcher = new Dispatcher(config.dispatcher);
    this.executor = new Executor({
      dispatcher: this.dispatcher,
      attemptStore: config.attemptStore,
      retryPolicy: config.retryPolicy,
    });
    this.approvalPolicy = config.approvalPolicy ?? new ApprovalPolicy();
    this.approvalService = new ApprovalService(config.approvalStore);
    this.idempotencyStore = config.idempotencyStore ?? new InMemoryIdempotencyStore();
    this.timelineWriter = new OperationTimelineWriter(config.timelineStore);
    this.eventPublisher = new OperationEventPublisher(config.eventBus);
    this.snapshotUpdater = new SnapshotUpdater(config.snapshotStore);
  }

  // ─── Public API ────────────────────────────────────────────────────────────

  getApprovalService(): ApprovalService { return this.approvalService; }

  async submit(request: OperationRequest): Promise<OperationResult> {
    const start = Date.now();

    // 1. Idempotency check
    if (request.idempotencyKey) {
      const existing = await this.idempotencyStore.get(request.tenantId, request.idempotencyKey);
      if (existing) {
        const payloadHash = hashRequest(request);
        if (existing.payloadHash !== payloadHash) {
          return this.failResult(request, start, makeError(
            'IDEMPOTENCY_CONFLICT',
            `Idempotency key '${request.idempotencyKey}' already used with different payload`,
            'validation',
          ));
        }
        // Same payload — return the original operation's record
        const original = await this.config.operationStore.get(request.tenantId, existing.operationId);
        if (original) {
          return recordToResult(original, Date.now() - start);
        }
      }
    }

    // 2. Create initial record
    const record = await this.createRecord(request, 'validating');

    // 3. Validation
    const commandDef = this.config.commandRegistry.get(request.commandName);
    const validation = await this.config.validator.validate(request, commandDef);
    if (!validation.valid) {
      return (await this.finalizeRecord(record, 'rejected', validation.errors, undefined, start)).operationResult;
    }

    // 4. Approval gate
    const approvalEval = this.approvalPolicy.evaluate(request, commandDef);
    if (approvalEval.required) {
      const approvalId = await getUlid();
      await this.approvalService.createRequest(request, approvalEval.reason ?? 'Approval required', approvalId);
      await this.updateRecord(record, { status: 'awaiting_approval', approvalRequestId: approvalId });
      await this.eventPublisher.publishApprovalRequired(record, approvalId);
      return recordToResult({ ...record, status: 'awaiting_approval', approvalRequestId: approvalId }, Date.now() - start);
    }

    // 5. Plan
    await this.updateRecord(record, { status: 'queued' });
    const planResult = this.planner.plan(request, commandDef);
    if (planResult.error) {
      return (await this.finalizeRecord(record, 'rejected', [planResult.error], undefined, start)).operationResult;
    }
    const plan = planResult.plan!;

    // 6. Before-execute hooks
    const beforeHooks = this.config.hooks?.beforeExecute ?? [];
    const beforeResult = await runBeforeExecuteHooks(beforeHooks, { request, plan });
    if (!beforeResult.proceed) {
      return (await this.finalizeRecord(record, 'rejected', [beforeResult.error], undefined, start)).operationResult;
    }

    // 7. Execute
    await this.updateRecord(record, { status: 'running' });
    const execResult = await this.executor.execute(plan);

    const finalStatus = execResult.succeeded
      ? 'succeeded'
      : execResult.errors.some(e => e.retryable)
        ? 'manual_review_required'
        : 'failed';

    const { record: finalRecord, operationResult: finalResult } = await this.finalizeRecord(
      record,
      finalStatus,
      execResult.errors,
      execResult.value,
      start,
    );

    // 8. After-execute / on-failure hooks
    const afterHooks = this.config.hooks?.afterExecute ?? [];
    await runAfterExecuteHooks(afterHooks, {
      record: finalRecord,
      executorResult: execResult,
    });

    if (!execResult.succeeded) {
      const failureHooks = this.config.hooks?.onFailure ?? [];
      await runOnFailureHooks(failureHooks, {
        record: finalRecord,
        errors: execResult.errors,
      });
    }

    // 9. Snapshot update (only on success)
    if (execResult.succeeded) {
      await this.snapshotUpdater.update(finalRecord);
    }

    // 10. Idempotency record
    if (request.idempotencyKey) {
      await this.idempotencyStore.set({
        tenantId: request.tenantId,
        key: request.idempotencyKey,
        operationId: request.operationId,
        status: finalStatus,
        payloadHash: hashRequest(request),
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + DEFAULT_IDEMPOTENCY_TTL_MS),
      });
    }

    return finalResult;
  }

  /** Resume an operation after approval is granted. */
  async resume(tenantId: string, operationId: string): Promise<OperationResult> {
    const record = await this.config.operationStore.get(tenantId, operationId);
    if (!record) {
      return this.failResult(
        { operationId, tenantId } as OperationRequest,
        Date.now(),
        makeError('TARGET_NOT_FOUND', `Operation '${operationId}' not found`, 'execution'),
      );
    }
    if (record.status !== 'awaiting_approval' && record.status !== 'approved') {
      return recordToResult(record, 0);
    }
    // Re-submit the request from the stored record
    return this.submit({
      operationId: record.operationId,
      commandName: record.commandName,
      profileId: record.profileId,
      tenantId: record.tenantId,
      actor: record.actor,
      target: record.target,
      payload: record.payload,
      options: record.options,
      context: record.context,
      correlationId: record.correlationId,
      requestedAt: record.requestedAt.toISOString(),
    });
  }

  async getOperation(tenantId: string, operationId: string): Promise<OperationRecord | null> {
    return this.config.operationStore.get(tenantId, operationId);
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private async createRecord(
    request: OperationRequest,
    status: import('../core/operation-status.js').OperationStatus,
  ): Promise<OperationRecord> {
    const now = new Date();
    const record: OperationRecord = {
      operationId: request.operationId,
      tenantId: request.tenantId,
      commandName: request.commandName,
      profileId: request.profileId,
      actor: request.actor,
      target: request.target,
      payload: request.payload,
      options: request.options,
      context: request.context,
      idempotencyKey: request.idempotencyKey,
      correlationId: request.correlationId,
      requestedAt: new Date(request.requestedAt),
      status,
      errors: [],
      attemptCount: 0,
      statusUpdatedAt: now,
      createdAt: now,
      updatedAt: now,
    };
    await this.config.operationStore.upsert(record);
    return record;
  }

  private async updateRecord(
    record: OperationRecord,
    patch: Partial<OperationRecord>,
  ): Promise<OperationRecord> {
    const updated = { ...record, ...patch, updatedAt: new Date(), statusUpdatedAt: new Date() };
    await this.config.operationStore.upsert(updated);
    return updated;
  }

  private async finalizeRecord(
    record: OperationRecord,
    status: import('../core/operation-status.js').OperationStatus,
    errors: import('../core/operation-error.js').OperationError[],
    result: unknown,
    startMs: number,
  ): Promise<{ record: OperationRecord; operationResult: OperationResult }> {
    const now = new Date();
    const finalRecord: OperationRecord = {
      ...record,
      status,
      errors,
      result,
      updatedAt: now,
      statusUpdatedAt: now,
    };
    await this.config.operationStore.upsert(finalRecord);

    const durationMs = Date.now() - startMs;

    if (isTerminal(status)) {
      await this.timelineWriter.writeOperationTrace(finalRecord, durationMs, errors);
      await this.eventPublisher.publishOperationCompleted(finalRecord);
    }

    return { record: finalRecord, operationResult: recordToResult(finalRecord, durationMs) };
  }

  private failResult(
    request: Pick<OperationRequest, 'operationId' | 'tenantId'>,
    startMs: number,
    error: import('../core/operation-error.js').OperationError,
  ): OperationResult {
    return {
      operationId: request.operationId,
      tenantId: request.tenantId,
      commandName: '',
      status: 'failed',
      errors: [error],
      attemptCount: 0,
      durationMs: Date.now() - startMs,
    };
  }
}

function recordToResult(record: OperationRecord, durationMs: number): OperationResult {
  return {
    operationId: record.operationId,
    tenantId: record.tenantId,
    commandName: record.commandName,
    status: record.status,
    errors: record.errors,
    result: record.result,
    attemptCount: record.attemptCount,
    durationMs,
  };
}

function hashRequest(request: OperationRequest): string {
  return createHash('sha256')
    .update(JSON.stringify({ commandName: request.commandName, payload: request.payload, target: request.target }))
    .digest('hex');
}
