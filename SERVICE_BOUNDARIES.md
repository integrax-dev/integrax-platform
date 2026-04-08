# Service Boundaries

Defines what belongs where. Read this before adding code to any service or package.

---

## Guiding rule

> A package owns a single concern. A service owns a single runtime surface.
> Cross-concern coupling is always a sign that something is in the wrong place.

---

## Packages (`packages/`)

Pure TypeScript libraries. No HTTP, no cron, no process entry points.

| Package | Owns | Does NOT own |
|---|---|---|
| `entities` | Canonical type definitions | Logic, persistence, validation |
| `platform-kernel` | Generic diff, identity resolution (Jaro-Winkler) | Entity-specific rules |
| `reconciliation-engine` | Entity-specific match/diff/policy | Generic diff primitives |
| `event-bus` | In-process event registry, fan-out, DLQ | Transport (Kafka, Redis) |
| `snapshot-store` | Last-known canonical state schema + InMemory impl | DB driver, migrations |
| `webhook-ingestion` | Signature validation, payload normalization, enqueue | HTTP routes, auth |
| `polling-scheduler` | Cursor-based incremental fetch, interval management | HTTP, Kafka, persistence |
| `timeline` | Audit trail types + InMemory impl | DB driver, query API |
| `workflow-engine` | Flow schema definition, node catalog | Execution, HTTP |
| `integration-orchestrator` | Closes the webhook/poll → snapshot → event loop | HTTP, connectors internals |
| `operation-engine` | Command lifecycle, approval, execution dispatch | Domain logic, connector internals |
| `connector-sdk` | Base types and utilities for connectors | Business logic |

---

## Connectors (`connectors/`)

Each connector owns exactly: its API adapter, its auth logic, its manifest, its facade.

**Connectors must NOT contain:**
- Reconciliation or diff logic
- Identity resolution
- Policy evaluation
- Country-specific rules (CUIT, CAE, AFIP)
- Workflow definitions
- Database access

The facade is the only public surface of a connector. Nothing outside the connector should import from `connector/src/` directly — only from `connector/facade/`.

---

## Modules (`modules/`)

Domain aggregates. Each module operates on canonical entities, uses connector facades (never connector internals), and emits/subscribes to events.

| Module | Owns |
|---|---|
| `orders` | Order lifecycle, status transitions |
| `inventory` | Stock levels, location, reservation |
| `billing` | Invoice lifecycle, payment linkage |
| `catalog` | Product/SKU catalog, pricing |
| `consistency-inspector` | Cross-system divergence detection, conflict emission |

Modules must NOT import from other modules directly. Communication is via event-bus.

---

## Services (`services/`)

Runtime processes. Each service owns one network surface.

| Service | Surface | Owns |
|---|---|---|
| `control-plane` | REST API (port 3000) | Route handlers, auth middleware, composition root |
| `realtime` | WebSocket (port 3003) | JWT auth, Redis pub-sub fan-out |
| `llm-orchestrator` | Internal API (port 3001) | Claude tool orchestration — advisory only |
| `connector-watchdog` | Internal daemon | Schema fingerprinting, drift detection |
| `connector-learning` | Internal API (port 3002) | LLM-powered connector discovery |
| `tenant` | Internal API (port 3004) | Multi-tenant lifecycle |
| `kafka-consumer` | Kafka topics | CDC → Temporal bridge |

`control-plane` is the **composition root** — it instantiates packages and wires them together. It must not contain business logic; it delegates to packages and modules.

---

## Country Packs (`country-packs/`)

Standalone packages with zero dependencies on core.

- `country-packs/ar`: CUIT normalization/validation, CAE validation, AFIP invoice types
- Core packages must NEVER import country packs
- Country packs may be used by: connectors, modules, profiles, country-specific workflows

---

## Profiles (`profiles/`)

Composites. A profile declares which modules, workflows, and entities are active for a vertical (ecommerce, legal, education…). It does not contain logic — only configuration.

---

## What does NOT belong in `control-plane/src/`

- Business rules
- Entity comparison logic  
- Connector-specific parsing
- Workflow execution
- Approval policies

These belong in packages or modules. `control-plane` wires them.
