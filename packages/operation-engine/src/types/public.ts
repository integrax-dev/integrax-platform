/**
 * Public types re-exported for consumers of the operation-engine.
 * Import from '@integrax/operation-engine' rather than from deep paths.
 */

export type { OperationActor, ActorType } from '../core/actor.js';
export type { OperationTarget, ExternalIdRef } from '../core/target.js';
export type { OperationCapability, CapabilityMap } from '../core/capability.js';
export type { OperationStatus } from '../core/operation-status.js';
export type { OperationError, OperationErrorCode } from '../core/operation-error.js';
export type { OperationRequest, OperationRecord, OperationResult } from '../core/operation.js';
export type { CommandDefinition } from '../core/command.js';
export type { IdempotencyRecord, IdempotencyStore } from '../core/idempotency.js';
export type { ApprovalRequest, ApprovalDecision, ApprovalStatus } from '../approvals/approval-request.js';
export type { ApprovalPolicyRule, TenantApprovalPolicies, ApprovalEvaluation } from '../approvals/approval-policy.js';
export type { OperationStore, OperationFilter } from '../storage/operation-store.js';
export type { OperationAttempt, OperationAttemptStore } from '../storage/operation-attempt-store.js';
export type { ApprovalStore } from '../storage/approval-store.js';
export type { PayloadSchema } from '../validation/preflight.js';
export type { PermissionPolicy } from '../validation/permission-check.js';
export type { StateRule } from '../validation/state-check.js';
export type { ValidatorConfig } from '../validation/validator.js';
export type { RetryPolicy } from '../execution/retry-policy.js';
export type { ExecutionPlan, ExecutionTarget, PlannerResult } from '../execution/planner.js';
export type { DispatchableFacade, ModuleActionHandler, DispatcherConfig } from '../execution/dispatcher.js';
export type { ExecutorResult } from '../execution/executor.js';
export type { OperationEngineConfig } from '../execution/operation-engine.js';
export type { FacadeFactory, FacadeRegistration, CredentialProvider } from '../integration/facade-resolver.js';
export type { BeforeExecuteHook, BeforeExecuteContext, BeforeExecuteResult } from '../hooks/before-execute.js';
export type { AfterExecuteHook, AfterExecuteContext } from '../hooks/after-execute.js';
export type { OnFailureHook, OnFailureContext } from '../hooks/on-failure.js';
