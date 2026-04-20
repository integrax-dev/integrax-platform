# @integrax/module-consistency-inspector

Cross-system consistency inspection. Compares canonical snapshots across connectors and emits `conflict.detected` events when divergence is found.

**Exports:** `SnapshotConsistencyInspector`, `moduleManifest`, types: `InspectionIssueKind`, `ConsistencyIssue`, `ConsistencyReport`, `InspectionFilter`.

**How it works:** reads from `snapshot-store`, compares entities by `ExternalId`, classifies issues (field mismatch, missing entity, duplicate), emits events via `event-bus`.

**Consumers:** `services/control-plane` (platform routes `/api/platform/tenants/:id/consistency`), `packages/reconciliation-engine`.
