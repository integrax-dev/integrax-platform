# IntegraX Platform Architecture V1

## Summary

IntegraX is a multi-tenant platform for building, executing, and maintaining integrations and automations with a differentiating layer of contract intelligence, drift detection, schema bridge, confidence scoring, operator feedback, and tenant-aware operational memory.

The product thesis is not "another workflow builder". The strongest positioning is:

> IntegraX is an adaptive integration platform: embeddable, multi-tenant, contract-aware, and operationally explainable.

## Product Definition

IntegraX combines:

- reliable workflow execution
- extensible connectors
- contract intelligence
- drift management
- schema bridge and mapping suggestions
- learning loop and operator memory
- explainability and tenant-aware policy enforcement

That puts it beyond the usual categories of:

- workflow automation tool
- connector SDK only
- API governance tool
- ETL/sync platform

## System Goals

Primary goals:

- build connectors and workflows with strong extension points
- execute integrations durably and auditably
- detect contract and payload drift before production failures
- classify compatibility impact automatically
- propose mappings with confidence scores
- learn from operator feedback and historical outcomes
- support SaaS, self-host, and embeddable deployment models

Non-goals for early phases:

- do not build a workflow engine from scratch
- do not attempt a giant visual builder first
- do not replace mature contract linting/parser tools
- do not support every integration category at launch

## Architecture Principles

- Reuse before reinventing for runtime, parsing, linting, and observability.
- Build proprietary logic where the product differentiates.
- Keep control plane and runtime cleanly separated.
- Make every critical decision tenant-aware.
- Treat contracts as versioned, explainable assets.
- Keep operator-in-the-loop for high-risk resolution paths.
- Prefer event-driven, auditable flows.

## High-Level Architecture

```text
                    +----------------------+
                    |     Control Plane    |
                    | tenants, auth, UI,   |
                    | policies, billing    |
                    +----------+-----------+
                               |
                               v
+----------------+   +----------------------+   +----------------------+
| Contract        |   | Integration Runtime  |   | Observability Layer  |
| Intelligence    +---> Temporal + adapters  +---> metrics, traces,    |
| specs, diffs,   |   | workflows, retries   |   | analytics, alerts    |
| lineage         |   +----------+-----------+   +----------------------+
+--------+--------+              |
         |                       v
         |             +----------------------+
         |             | Connector SDK /      |
         |             | Connectors Registry  |
         |             +----------+-----------+
         |                        |
         v                        v
+----------------+     +----------------------+     +-------------------+
| Drift Engine   +-----> Schema Bridge Engine +-----> Learning Loop     |
| runtime/spec   |     | mappings, conflicts, |     | feedback, memory, |
| drift detection|     | confidence           |     | overrides         |
+----------------+     +----------------------+     +-------------------+
```

## Module Map

### 1. Control Plane

Responsibilities:

- tenants
- users, roles, approvals
- auth and access control
- secrets and tenant configuration
- audit log
- billing
- explainability UI
- contract registry views
- drift history
- mapping memory UI

Current repo alignment:

- `services/control-plane`

Recommended additions:

- `policies/`
- `approvals/`
- `audit-log/`
- `confidence-history/`
- `contract-registry/`
- `mapping-memory-ui/`

Build vs reuse:

- Reuse external auth/identity where possible.
- Keep tenant policy, explainability, memory history, and approval logic inside IntegraX.

### 2. Integration Runtime

Responsibilities:

- durable workflow execution
- retries, timeouts, compensation
- scheduling and webhooks
- idempotency and long-running jobs
- tenant-aware execution policy

Current repo alignment:

- `workflows/temporal`

Decision:

- Use Temporal as the primary runtime.
- Do not build a workflow engine from scratch.

What IntegraX still needs on top:

- workflow registry
- connector execution adapter
- mapping resolver middleware
- schema guardrail hooks
- tenant-aware execution policies

### 3. Connector SDK

Responsibilities:

- connector definition
- auth
- actions and triggers
- schema declaration
- pagination
- rate limits
- errors
- mappings
- tests and versioning

Current repo alignment:

- `connectors/`
- `connectors/sdk/typescript`

Desired SDK surface:

```ts
defineConnector()
defineAuth()
defineActions()
defineTriggers()
defineSchemas()
definePagination()
defineRateLimits()
defineMappings()
defineErrors()
```

Design guidance:

- Airbyte for declarative connector modeling
- Activepieces for TypeScript DX and extensibility
- n8n and Activepieces for embeddable product shape

### 4. Contract Intelligence

Responsibilities:

- ingest OpenAPI and AsyncAPI
- normalize and snapshot contracts
- lint and version contracts
- compute contract diffs
- classify compatibility risk
- provide contract lineage and explainability

Current repo alignment:

- `contracts/openapi`
- `contracts/asyncapi`
- `scripts/verify-integration-surface`

Recommended target module:

- `contract-intelligence/`

Reuse:

- Redocly CLI
- existing OpenAPI diff tooling

IntegraX-owned logic:

- tenant risk scoring
- compatibility scoring against live mappings
- explainability tied to runtime and learning history

### 5. Drift Engine

Responsibilities:

- periodic contract checks
- snapshot comparison
- payload/runtime drift detection
- anomaly detection between spec and runtime
- confidence degradation
- incident generation and policy-triggered actions

Current repo alignment:

- `scripts/run-drift-check`
- `scripts/verify-integration-surface`
- schema drift logic already emerging in `schema-bridge`

Recommended target module:

- `drift-engine/`

Model guidance:

- borrow breaking-change categorization ideas from Buf
- keep OpenAPI-specific implementation separate from the classification model

### 6. Schema Bridge Engine

Responsibilities:

- compare schema A vs schema B
- detect rename candidates
- detect type conflicts
- detect enum shrink and optional-to-required changes
- classify semantic conflicts
- propose mappings
- compute confidence
- explain decisions

Current repo alignment:

- `packages/schema-bridge`
- `packages/schema-bridge-piece`

This is core IP.

Subcomponents to formalize:

- mapping reuse index
- semantic similarity index
- operator override memory
- conflict classifier
- resolution explainer

### 7. Connector Learning Engine

Responsibilities:

- learn from contracts
- learn from examples and runtime payloads
- learn from failures and drift history
- enrich connector metadata and scaffold quality

Current repo alignment:

- `services/connector-learning`
- `scripts/learn-api`

This is core IP.

Target pipeline:

1. ingest
2. normalize
3. snapshot
4. diff
5. classify
6. suggest
7. score
8. persist
9. re-evaluate

### 8. Learning Loop

Responsibilities:

- operator overrides
- false positives
- false negatives
- mapping corrections
- contract patches
- tenant-specific memory
- confidence history

Current repo alignment:

- pieces of this already exist in `schema-bridge`, `control-plane`, and connector-learning

Recommended target module:

- `learning-loop/`

This is core IP.

### 9. Observability Layer

Responsibilities:

- metrics
- logs
- traces
- analytics
- alerts
- connector and mapping health

Recommended platform metrics:

- contract drift rate
- schema volatility index
- connector reliability score
- mapping success rate
- override frequency
- mean time to safe resolution
- confidence evolution

Reuse:

- OpenTelemetry
- standard analytics/event infrastructure

## Repo Shape Target

```text
integrax-platform/
  control-plane/
  sdk/
  connectors/
    registry/
    templates/
    tests/
  workflows/
    temporal/
  runtime/
    execution-adapter/
    workflow-registry/
    schema-guardrails/
  contract-intelligence/
  drift-engine/
  schema-bridge/
  connector-learning/
  learning-loop/
  observability/
  contracts/
    openapi/
    asyncapi/
  scripts/
    learn-api
    verify-integration-surface
    run-drift-check
```

## Reuse vs Core IP

Reuse:

- Temporal for runtime
- Redocly for contract linting and normalization base
- existing OpenAPI diff tooling for baseline contract diff
- Buf as a compatibility-model reference
- OpenTelemetry and standard analytics infrastructure
- Airbyte ideas for connector modeling
- Activepieces ideas for TypeScript pieces, extensibility, self-host, AI/human-in-the-loop, embeddable automation
- n8n ideas for embed/productization

Build as IntegraX core IP:

- Schema Bridge Engine
- Drift Intelligence tied to runtime reality
- Mapping Memory Layer
- Confidence Scoring System
- Operator Feedback Loop
- Explainability Layer
- tenant-aware adaptive behavior across connectors and workflows

## Competitive Positioning

### n8n

Strong reference for workflow builder and embeddable automation.
Weak relative to IntegraX in contract intelligence, drift, and mapping memory.

### Activepieces

Very relevant reference for:

- TypeScript-based extension model
- self-host approach
- embeddable automation
- AI/human-in-the-loop ergonomics

Closer to IntegraX than many alternatives on extensibility and product shape.

### Airbyte

Best reference for connector modeling, declarative specs, and builder strategy.
More sync/ETL-oriented than IntegraX.

### Temporal

Runtime platform, not a full product substitute.
Best used as infrastructure inside IntegraX.

### Redocly

Strong contract governance base.
Does not provide runtime-aware, tenant-aware adaptive resolution.

### Buf

Excellent model for compatibility classes and enforcement.
Useful as an architectural pattern, not as the direct OpenAPI solution.

## Irreversible Early Decisions

- Temporal as primary runtime or not
- multi-tenant isolation model
- connector SDK contract shape
- persistence model for mapping memory
- compatibility taxonomy: breaking vs suspicious vs safe
- policy for auto-accept, review, and block
- hard boundary between control plane and runtime

## Main Risks

Technical risks:

- overbuilding too many custom modules too early
- mixing drift, learning, and schema bridge responsibilities
- creating an over-complex connector SDK
- coupling runtime too tightly to control-plane assumptions

Product risks:

- positioning as "another automation tool"
- trying to support too many connectors too early
- over-automating high-risk decisions without operator review

## Recommended Delivery Order

### Phase 1: strong demo

Build:

- Temporal runtime integration
- 2-3 strong connectors
- basic contract intelligence
- basic drift engine
- schema bridge v1
- minimal control-plane UI

Target demo:

> "The upstream API changed. IntegraX detected the change, classified the risk, proposed a mapping, and explained whether production is safe."

### Phase 2: make it sticky

Build:

- operator feedback loop
- mapping memory
- confidence history
- approvals
- per-tenant alerts
- contract lineage

### Phase 3: make it a platform

Build:

- public SDK
- templates
- embeddable builder
- marketplace
- billing
- compliance and advanced audit capabilities

## Quick Wins

- formalize `contract-intelligence/`
- convert `run-drift-check` into a persistent service capability
- lock the Schema Bridge Engine contract
- define the first stable connector SDK interface
- ship a dashboard for drift and confidence
- demo one real API change with end-to-end explanation

## Final Strategic Definition

The strongest version of IntegraX is not:

- "an Argentinian n8n"
- "an open-source Zapier"
- "Temporal with a UI"

The strongest version is:

> an adaptive, embeddable, multi-tenant integration platform with reliable runtime, extensible connectors, contract intelligence, drift detection, schema bridge, and operational memory.

## Next Documents

The next practical step is an ADR pack covering:

- ADR-001 - Temporal as primary runtime
- ADR-002 - Multi-tenancy model
- ADR-003 - Connector SDK design
- ADR-004 - Breaking change classification
- ADR-005 - Schema Bridge Engine design
- ADR-006 - Mapping Memory and operator feedback loop
- ADR-007 - Observability and confidence metrics
