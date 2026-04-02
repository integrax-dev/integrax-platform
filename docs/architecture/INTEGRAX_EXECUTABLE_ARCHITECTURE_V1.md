# IntegraX Executable Architecture V1

## Purpose

This document turns the platform vision into concrete engineering decisions for an embeddable, multi-tenant MVP that can produce a strong demo in 4-6 weeks.

It is intentionally stricter than the conceptual architecture. It chooses a runtime, persistence model, module boundaries, and reuse strategy for a small team.

## Executive Decision

IntegraX V1 will be built as a multi-tenant control plane plus an embeddable execution layer, with:

- Temporal as the primary runtime
- a TypeScript-first connector SDK
- a standalone Schema Bridge Engine as core IP
- contract intelligence built on top of existing linting and diff tooling
- a drift engine that correlates contract drift, runtime drift, and mapping continuity
- a tenant-aware learning loop backed by Postgres

The platform will reuse existing infrastructure aggressively and reserve custom engineering for schema bridge, confidence scoring, mapping memory, explainability, and operator feedback.

## Constraints

- do not build a workflow engine
- small initial team
- strong demo in 4-6 weeks
- embeddable from the start
- multi-tenant is mandatory
- prefer managed or mature OSS primitives over bespoke platform code

## Final Modular Architecture

```text
                           +----------------------------+
                           |        Control Plane       |
                           | auth, tenants, policies,   |
                           | approvals, explainability  |
                           +-------------+--------------+
                                         |
                     +-------------------+-------------------+
                     |                                       |
                     v                                       v
        +---------------------------+           +---------------------------+
        | Contract Intelligence     |           | Connector Registry / SDK  |
        | specs, snapshots, diffs   |           | metadata, auth, actions   |
        +-------------+-------------+           +-------------+-------------+
                      |                                         |
                      v                                         v
        +---------------------------+           +---------------------------+
        | Drift Engine              |           | Runtime Adapter Layer     |
        | contract + runtime drift  |           | connector execution API   |
        +-------------+-------------+           +-------------+-------------+
                      |                                         |
                      +-------------------+---------------------+
                                          |
                                          v
                              +---------------------------+
                              | Temporal Runtime          |
                              | workflows, retries, jobs  |
                              +-------------+-------------+
                                            |
                                            v
                              +---------------------------+
                              | Schema Bridge Engine      |
                              | mappings, confidence,     |
                              | explainability            |
                              +-------------+-------------+
                                            |
                                            v
                              +---------------------------+
                              | Learning Loop             |
                              | memory, overrides, decay  |
                              +-------------+-------------+
                                            |
                                            v
                              +---------------------------+
                              | Observability Layer       |
                              | metrics, traces, events   |
                              +---------------------------+
```

## Hard Decisions by Module

### 1. Runtime orchestration

Decision:

- Use Temporal as the primary workflow runtime.
- Do not support a second runtime in V1.
- Keep Temporal hidden behind `packages/integration-engine`.

Why:

- long-running execution, retries, compensation, timers, and auditability are already solved problems
- a second runtime path would dilute a small team
- the existing adapter direction in `integration-engine` is already the right boundary

Rejected alternatives:

- BullMQ plus custom orchestration: faster to start, but weak for durable execution and recovery
- pure Activepieces runtime as the core system model: good for workflow UX, weak as the system-of-record for durable platform execution
- custom workflow engine: explicitly forbidden and strategically wasteful

V1 stack:

- Temporal Server or Temporal Cloud
- TypeScript workers in `workflows/temporal`
- `packages/integration-engine` as the only API consumed by the control plane

### 2. Connector SDK

Decision:

- TypeScript-first SDK, package-based, inspired by Activepieces for DX and Airbyte for declarative modeling.
- One stable connector contract for both internal and future external connectors.

Required SDK surface:

```ts
defineConnector()
defineAuth()
defineAction()
defineTrigger()
defineSchema()
definePagination()
defineRateLimit()
defineErrorMap()
```

V1 design rules:

- connector definitions are declarative first
- imperative escape hatches are allowed only inside actions and triggers
- auth, rate limit, retry, idempotency, and observability hooks belong in the SDK, not in connector apps
- schema metadata must be emitted in a normalized internal format for contract intelligence and schema bridge

V1 stack:

- TypeScript packages under `connectors/implementations`
- shared SDK in `connectors/sdk/typescript`
- registry metadata persisted in Postgres and exposed via control plane APIs

### 3. Contract Intelligence Engine

Decision:

- Build a dedicated `contract-intelligence` module, but reuse mature tooling for parsing, linting, and baseline diff.
- Contract Intelligence owns normalized contracts, version snapshots, compatibility summaries, and lineage.

Reuse:

- Redocly for linting and normalization base
- existing OpenAPI diff tooling for first-pass structural diff

Do not build in V1:

- a custom OpenAPI parser
- a custom linter
- a fully custom diff engine for basic structural changes

IntegraX-owned logic:

- normalization to the internal contract model
- mapping-aware impact scoring
- tenant-aware compatibility views
- explainability artifacts consumed by the control plane

V1 stack:

- Node service or package under `contract-intelligence`
- Postgres for contract snapshots and lineage
- object storage or git-backed artifact storage for raw source specs when needed

### 4. Drift Detection Engine

Decision:

- Separate drift detection from schema bridge.
- Drift Engine detects and classifies changes; Schema Bridge proposes continuity actions.

Drift sources:

- contract drift from spec snapshots
- runtime drift from sampled payloads and response shapes
- behavior drift from error-rate and status-pattern anomalies

Taxonomy:

- safe
- suspicious
- review-required
- breaking

Reuse:

- Buf only as a compatibility-classification inspiration
- current watchdog logic as the starting implementation

V1 stack:

- dedicated `drift-engine` module extracted from current watchdog and scripts
- scheduled checks via Temporal or cron-triggered workers
- results persisted in Postgres

### 5. Schema Bridge Engine

Decision:

- Keep Schema Bridge as core IP and make it runtime-agnostic.
- The engine receives normalized schemas, candidate mappings, memory signals, and tenant policy context, then returns a resolution proposal.

Capabilities required in V1:

- rename candidate detection
- enum drift detection
- type conflict detection
- requiredness change detection
- semantic similarity scoring
- mapping suggestion generation
- confidence scoring
- resolution explanation

Explicit non-goals for V1:

- unrestricted LLM-first mapping
- deep ontology management platform
- universal semantic understanding of arbitrary domains

V1 stack:

- `packages/schema-bridge`
- `packages/schema-bridge-piece` only as integration surface, never as the core engine
- deterministic heuristics first, optional LLM escalation only for review-required cases

### 6. Learning Loop persistence

Decision:

- Persist operator feedback and mapping memory in Postgres from day one.
- Do not use in-memory stores as the source of truth.

Stored entities:

- accepted mappings
- rejected mappings
- false positives
- false negatives
- operator overrides
- contract patches
- confidence history
- tenant-specific exceptions

Behavior rules:

- memory is tenant-scoped by default
- cross-tenant reuse is opt-in, weighted, and never automatic in V1
- stale memory decays over time
- operator overrides outrank model suggestions

V1 stack:

- Postgres relational tables for memory and auditability
- Redis only for cache and short-lived coordination

### 7. Observability stack

Decision:

- Standardize on OpenTelemetry for traces, metrics, and logs correlation.
- Keep product-specific metrics in an internal event schema owned by IntegraX.

Core product metrics:

- contract drift rate
- schema volatility index
- connector reliability score
- mapping success rate
- override frequency
- mean time to safe resolution
- confidence evolution

V1 stack:

- OpenTelemetry SDK and collectors
- Prometheus-compatible metrics
- Grafana for operational dashboards
- Postgres event tables for product analytics at low volume

Deferred:

- ClickHouse can wait until event volume justifies it
- custom observability platform is out of scope

### 8. Control plane multi-tenant model

Decision:

- Shared infrastructure with strict logical isolation in V1.
- Every domain entity carries `tenant_id` and tenant-aware access enforcement.
- Prepare clean seams for higher-isolation enterprise tiers later.

Tenant-aware domains:

- connectors
- secrets
- workflows
- contracts
- drift incidents
- mappings
- feedback memory
- observability views
- approvals

V1 stack:

- Postgres with tenant-scoped tables and row-level enforcement in the application layer
- separate secret storage abstraction; external vault can be added without changing the API
- control plane APIs in `services/control-plane`

Embeddable rule:

- all control plane functionality exposed via internal APIs first
- admin panel consumes the same APIs as any embedded host would consume

### 9. Internal APIs between modules

Decision:

- Module boundaries are contract-first and event-aware.
- Internal consumers must use package APIs, never import service `src/` internals.

Primary synchronous APIs:

- `integration-engine`: execute workflow, inspect run, cancel run
- `contract-intelligence`: ingest contract, diff versions, fetch lineage
- `drift-engine`: evaluate source, record incident, fetch report
- `schema-bridge`: compare schemas, suggest mapping, explain resolution
- `learning-loop`: persist feedback, query memory, update confidence

Primary async events:

- contract ingested
- contract diff detected
- drift incident opened
- mapping suggestion accepted
- mapping suggestion rejected
- workflow degraded
- confidence changed

V1 API transport:

- internal TypeScript package boundaries for same-repo consumers
- HTTP or queue boundary only where process separation is already required
- do not introduce Kafka as a mandatory dependency for the first demo

### 10. Final repo structure

Decision:

- Keep monorepo.
- Promote conceptual areas into first-class packages or services instead of leaving them as scripts.

```text
integrax-platform/
  apps/
    admin-panel/
  services/
    control-plane/
    contract-intelligence/
    drift-engine/
    connector-learning/
    realtime/
    metrics/
    secrets/
    tenant/
  packages/
    integration-engine/
    schema-bridge/
    schema-bridge-piece/
    logger/
    health/
    contracts-ts/
  connectors/
    sdk/
      typescript/
    registry/
    implementations/
  workflows/
    temporal/
  contracts/
    openapi/
    asyncapi/
  docs/
  scripts/
```

## What to Reuse vs What to Build

### Reuse directly

- Temporal for workflow execution
- Redocly for contract linting and normalization base
- existing OpenAPI diff tooling for structural diffs
- OpenTelemetry for observability instrumentation
- Grafana and Prometheus-compatible metrics stack

### Reuse as a model, not as the core implementation

- Activepieces for TypeScript extension ergonomics and embeddable automation ideas
- Airbyte for connector modeling patterns and specification discipline
- n8n for product and embedding ideas, not for core runtime
- Buf for compatibility classes and enforcement philosophy

### Build as IntegraX core IP

- Schema Bridge Engine
- confidence scoring
- mapping memory
- operator feedback loop
- mapping-aware drift correlation
- explainability layer
- tenant-aware adaptive decisioning

## Role of Key External References

### Activepieces

Reuse:

- TypeScript piece ergonomics
- embeddable automation posture
- extension velocity model

Do not reuse as the primary workflow authority.

### n8n

Reuse:

- embed and product packaging ideas
- workflow UX references

Do not reuse as the core engine or product thesis.

### Airbyte

Reuse:

- connector modeling discipline
- declarative spec ideas
- connector lifecycle patterns

Do not inherit ETL-centric assumptions into the entire platform.

### Temporal

Reuse directly as runtime infrastructure.

### Redocly

Reuse directly for contract linting and normalization support.

### Buf

Reuse as a classification pattern for safe vs breaking compatibility semantics.

## Irreversible Early Decisions

- Temporal is the only runtime in V1
- Postgres is the source of truth for tenant memory and contract lineage
- connector SDK is TypeScript-first
- internal contract model is normalized once and reused across modules
- compatibility taxonomy is fixed early and shared across contract intelligence, drift, and schema bridge
- control plane and runtime stay decoupled behind internal APIs
- embeddable API surface is first-class from day one

## Technical Risks

- letting scripts remain the real implementation path instead of first-class modules
- mixing drift detection and schema bridge responsibilities
- over-designing the SDK before connector patterns stabilize
- adding LLM dependency too early in resolution-critical paths
- weak tenant isolation discipline in early schemas and APIs
- control plane routes becoming a dumping ground for domain logic

## Correct Implementation Order

### Phase 0: platform cuts

1. lock internal compatibility taxonomy
2. lock connector SDK surface
3. lock normalized contract model
4. define tenant-aware persistence conventions

### Phase 1: strong demo foundation

1. integrate Temporal through `integration-engine`
2. formalize `contract-intelligence`
3. extract `drift-engine` from watchdog/scripts
4. ship Schema Bridge V1 API
5. persist mapping memory in Postgres
6. expose explainability and drift views in control plane

### Phase 2: make it sticky

1. operator approvals
2. confidence history
3. tenant alerts
4. runtime drift correlation
5. connector learning pipeline hardening

### Phase 3: platformize

1. public connector SDK packaging
2. connector registry and templates
3. embeddable builder surfaces
4. enterprise isolation options

## Dependency Graph

```text
Connector SDK
  -> Contract Intelligence
  -> Integration Engine

Contract Intelligence
  -> Drift Engine
  -> Schema Bridge

Drift Engine
  -> Schema Bridge
  -> Control Plane

Schema Bridge
  -> Learning Loop
  -> Control Plane

Learning Loop
  -> Schema Bridge
  -> Control Plane

Integration Engine
  -> Temporal
  -> Connector SDK
  -> Schema Bridge

Control Plane
  -> all read models and orchestration APIs
```

## V1 Summary

The executable V1 of IntegraX is:

- Temporal-backed
- TypeScript connector-first
- Postgres-backed for contracts, memory, and tenant state
- OpenTelemetry-instrumented
- contract-aware and drift-aware
- differentiated by Schema Bridge, confidence, memory, and explainability

The main discipline for the next 4-6 weeks is simple: build the adaptive layer, not generic plumbing.
