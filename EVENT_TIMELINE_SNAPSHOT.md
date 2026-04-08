# Events, Timeline, and Snapshots

How the three state-tracking mechanisms work and when to use each.

---

## Snapshot Store

**What it is:** The last known canonical state of every entity, per tenant.

**Schema:** `EntitySnapshot`
```
snapshotId      — ulid
tenantId        — tenant isolation
entityType      — 'product' | 'order' | 'invoice' | ...
canonicalId     — stable cross-system identifier (from IdentityResolver)
externalIds     — [{ system, id }] all known external references
payloadHash     — SHA-256 of normalized payload (used for change detection)
payload         — field-mapped canonical payload
sourceSystem    — which connector produced this snapshot
updatedAtSource — timestamp from the source system
updatedAtSnapshot — when we wrote this snapshot
```

**Written by:** `integration-orchestrator` (SnapshotWriter) and `operation-engine` (SnapshotUpdater)

**Read by:** modules, consistency-inspector, API routes (`GET /snapshots/:entityType`)

**Key property:** Only written when `payloadHash` changes. Identical payloads are silently skipped — no spurious events, no duplicate timeline entries.

---

## Event Bus

**What it is:** In-process typed event registry for decoupled fan-out.

**Event shape:** `IntegraxEvent<T>`
```
id            — ulid
type          — IntegraxEventType (curated list)
tenantId      — required
sourceSystem  — connector or service that produced it
entityType    — canonical entity type
entityId?     — canonicalId if resolved
payload       — event-specific data
occurredAt    — source timestamp
correlationId? — trace linkage
```

**Registered event types:** See [EVENT_SYSTEM.md](EVENT_SYSTEM.md)

**Published by:**
- `webhook-ingestion` → `'webhook.received'`
- `integration-orchestrator` → entity-specific events (`'order.updated'`, `'snapshot.updated'`, …)
- `consistency-inspector` → `'conflict.detected'`, `'conflict.resolved'`
- `operation-engine` → operation result events

**Subscribed by:** modules, container subscriptions, operation-engine hooks

**DLQ:** Failed handlers are captured in the dead-letter queue. Inspect via `eventBus.deadLetterQueue()`, replay via `eventBus.replayDlq(type?)`.

---

## Timeline

**What it is:** Append-only audit trail. Human-inspectable record of everything that happened.

**Four trace kinds:**

| Kind | When written | Who writes it |
|---|---|---|
| `entity` | Every time an entity snapshot changes | `integration-orchestrator` (TimelineWriter) |
| `sync` | Once per poll batch or per webhook | `integration-orchestrator` |
| `conflict` | When divergence detected; updated on resolution | `consistency-inspector` |
| `workflow` | Per workflow run step | `workflow-engine` (future) |

**Mutable entries:** Only `ConflictTrace.status` can be updated (via `resolveConflict()`). Everything else is immutable.

**API:** `GET /api/tenants/:tenantId/timeline` — filterable by `kind`, `entityType`, `from`, `to`, `severity`

---

## When to use which

| I want to... | Use |
|---|---|
| Know the current state of an entity | Snapshot Store |
| React to a change in real time | Event Bus subscription |
| Audit what happened and when | Timeline |
| Detect divergence between systems | Consistency Inspector → Snapshot diff |
| Understand the history of a conflict | Timeline `ConflictTrace` |
| Trigger a workflow when stock changes | Subscribe to `'stock.changed'` event |

---

## What NOT to do

- Do not store business logic in snapshots — they are data, not decisions
- Do not use the timeline as a query source for current state — use snapshot store
- Do not publish events for internal state that has no external consumer
- Do not write ConflictTraces manually — consistency-inspector owns them
- Do not use event correlationId as a database foreign key — it is a tracing hint only
