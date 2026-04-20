# @integrax/timeline

Append-only event log for entity changes, sync runs, conflict lifecycle, schema drift, and workflow executions.

**Exports:** `InMemoryTimelineStore`, types: `TimelineEntry`, `TimelineKind` (`entity_change | sync_run | conflict | workflow | schema_drift`), `EntityTrace`, `SyncTrace`, `ConflictTrace`, `WorkflowTrace`, `SchemaDriftTrace`, `TimelineFilter`, `TimelineStore` interface.

**Production implementation:** `services/control-plane/src/store/pg-timeline-store.ts` (Postgres-backed).

**Consumers:** `packages/integration-orchestrator`, `packages/operation-engine`, `services/control-plane` (timeline routes `/api/timeline`).
