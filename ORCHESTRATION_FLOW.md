# Orchestration Flow

End-to-end data flow from external system to platform state.

---

## 1. Inbound Webhook

```
External system
  └── POST /webhooks/:connectorId
        └── webhook-ingestion (validateSignature → normalizePayload)
              └── enqueueWebhook → eventBus.publish('webhook.received')
                    └── container subscription
                          └── orchestrator.processWebhookItem(connectorId, entityType, raw, tenantId)
                                ├── ConnectorManifestRegistry.getManifest(connectorId)
                                ├── Canonicalizer.canonicalize(raw, entityType, manifest, resolver)
                                │     ├── field mapping (dot-notation paths from manifest)
                                │     └── IdentityResolver.resolveOrCreate → stable canonicalId
                                ├── SnapshotWriter.write(tenantId, entity)
                                │     ├── snapshotStore.get(existing)
                                │     ├── hashPayload(payload) → compare with previous
                                │     └── snapshotStore.upsert(snapshot) if changed
                                ├── [if changed] EventPublisher.publishSnapshotUpdated
                                │     └── eventBus.publish(entity-specific event)
                                └── [if changed] TimelineWriter.writeEntityTrace + writeSyncTrace
```

---

## 2. Polling

```
PollingScheduler (setInterval per job)
  └── facade.listEntities(entityType, { cursor_field_gt: lastValue })
        └── for each record:
              └── eventBus.publish('webhook.received', { payload: record, entityType, sourceSystem })
                    └── same subscription as webhook path above
        └── cursors.set(newCursor)
  └── (batch complete) → timelineStore.append(SyncTrace)
```

Polling jobs are registered via `registerTenantPolling()`. Each `(tenantId, connectorId, entityType)` tuple is one job. Interval minimum: 10 seconds.

---

## 3. Operation / Command

```
Caller (API, workflow, module)
  └── OperationEngine.submit(OperationRequest)
        ├── Validator.validate(request) — schema, required fields
        ├── PermissionCheck.check(actor, commandName, target)
        ├── CapabilityCheck.check(connectorId, commandName)
        ├── StateCheck.check(entityType, canonicalId, commandName)
        ├── ApprovalService.evaluate(request) → required? → OperationStatus.awaiting_approval
        ├── [if approved/not required] Planner.plan(request)
        │     └── resolves target facade or module action
        ├── Executor.execute(plan)
        │     ├── facade.execute(operation, payload)  OR  module.action(payload)
        │     ├── RetryPolicy.shouldRetry(error) on failure
        │     └── records attempt in OperationAttemptStore
        ├── SnapshotUpdater.update(result) — if operation mutated state
        ├── EventPublisher.publish(result event)
        └── TimelineWriter.writeOperationTrace(result)
```

---

## 4. Consistency Inspection

```
Trigger: event subscription ('snapshot.updated') or manual API call
  └── ConsistencyInspector.inspect(tenantId, entityType)
        ├── snapshotStore.list(tenantId, entityType) — all snapshots
        ├── for each pair (snapshotA, snapshotB from different systems):
        │     └── snapshotStore.diff(a, b) → ComparisonResult
        ├── [if conflicts] eventBus.publish('conflict.detected')
        └── timelineStore.append(ConflictTrace)
```

---

## Dependency flow (no cycles)

```
entities ← platform-kernel ← snapshot-store
entities ← event-bus
entities ← reconciliation-engine
snapshot-store + event-bus + timeline ← integration-orchestrator
integration-orchestrator + operation-engine ← control-plane (composition root)
modules ← (snapshot-store + event-bus + reconciliation-engine)
```

---

## Key invariants

1. **Connectors are never called directly** — always via facade
2. **Snapshots are written only by the orchestrator** (webhook/poll path) or operation-engine (command path)
3. **Events are the only coupling** between modules — no direct module-to-module imports
4. **Timeline is append-only** — conflict traces are the only mutable entries (status field)
5. **Identity is tenant-scoped** — one `IdentityResolver` per tenant, never shared across tenants
