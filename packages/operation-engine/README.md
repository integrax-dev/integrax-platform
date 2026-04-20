# @integrax/operation-engine

Generic operation/command engine. Transforms operational intent (e.g. "refund order X") into an auditable, approval-aware, retry-safe execution.

**Exports:** `OperationEngine`, `CommandRegistry`, `Planner`, `Executor`, `Dispatcher`, `Validator`, `ApprovalService`, `ApprovalPolicy`, lifecycle hooks (`runBeforeExecuteHooks`, `runAfterExecuteHooks`, `runOnFailureHooks`), in-memory stores, integration helpers (`FacadeResolver`, `OperationTimelineWriter`, `OperationEventPublisher`, `SnapshotUpdater`).

**Flow:** register commands → plan operation → validate (permission + capability + state) → execute with retry + timeout → write timeline + publish event.

**Consumers:** `services/control-plane` (operations routes `/api/operations`), `modules/payments`, `modules/orders`.
