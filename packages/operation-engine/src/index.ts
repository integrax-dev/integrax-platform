/**
 * @integrax/operation-engine
 *
 * Generic Operation / Command Engine.
 * Transforms operational intent into executable, auditable actions.
 */

// ─── Core ─────────────────────────────────────────────────────────────────────
export { CommandRegistry } from './core/command.js';
export { inferCapability } from './core/capability.js';
export { isTerminal, isActive, TERMINAL_STATUSES, ACTIVE_STATUSES } from './core/operation-status.js';
export { makeError } from './core/operation-error.js';
export { InMemoryIdempotencyStore, DEFAULT_IDEMPOTENCY_TTL_MS } from './core/idempotency.js';

// ─── Validation ───────────────────────────────────────────────────────────────
export { Validator } from './validation/validator.js';
export { runPreflight } from './validation/preflight.js';
export { checkPermission } from './validation/permission-check.js';
export { checkCapability } from './validation/capability-check.js';
export { checkState } from './validation/state-check.js';

// ─── Execution ────────────────────────────────────────────────────────────────
export { OperationEngine } from './execution/operation-engine.js';
export { Planner } from './execution/planner.js';
export { Executor } from './execution/executor.js';
export { Dispatcher } from './execution/dispatcher.js';
export { shouldRetry, DEFAULT_RETRY_POLICY, NO_RETRY_POLICY } from './execution/retry-policy.js';
export { withTimeout, DEFAULT_TIMEOUT_MS } from './execution/timeout-policy.js';

// ─── Storage ─────────────────────────────────────────────────────────────────
export { InMemoryOperationStore } from './storage/operation-store.js';
export { InMemoryOperationAttemptStore } from './storage/operation-attempt-store.js';
export { InMemoryApprovalStore } from './storage/approval-store.js';

// ─── Approvals ────────────────────────────────────────────────────────────────
export { ApprovalPolicy } from './approvals/approval-policy.js';
export { ApprovalService } from './approvals/approval-service.js';

// ─── Hooks ────────────────────────────────────────────────────────────────────
export { runBeforeExecuteHooks } from './hooks/before-execute.js';
export { runAfterExecuteHooks } from './hooks/after-execute.js';
export { runOnFailureHooks } from './hooks/on-failure.js';

// ─── Integration ─────────────────────────────────────────────────────────────
export { FacadeResolver } from './integration/facade-resolver.js';
export { OperationTimelineWriter } from './integration/timeline-writer.js';
export { OperationEventPublisher } from './integration/event-publisher.js';
export { SnapshotUpdater } from './integration/snapshot-updater.js';

// ─── Public types ─────────────────────────────────────────────────────────────
export type * from './types/public.js';
