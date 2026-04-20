# @integrax/snapshot-store

Last-known canonical state store for cross-system entity snapshots. Used to detect changes and drive event-bus publishing.

**Exports:** `InMemorySnapshotStore`, `hashPayload`, types: `EntitySnapshot`, `SnapshotFilter`, `SnapshotDiff`, `SnapshotStore` interface.

**How it works:** upserts a snapshot keyed by `(tenantId, connectorId, entityType, entityId)`; returns `SnapshotDiff` if payload hash changed.

**Production note:** `services/control-plane/src/store/pg-snapshot-store.ts` provides the Postgres-backed implementation used in production. `InMemorySnapshotStore` is for tests.

**Consumers:** `packages/integration-orchestrator`, `modules/consistency-inspector`.
