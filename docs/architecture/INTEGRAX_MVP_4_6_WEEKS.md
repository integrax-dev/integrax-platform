# IntegraX MVP in 4-6 Weeks

## Goal

Ship a technically impressive, sellable MVP that proves one thing clearly:

> IntegraX detects upstream API changes before production breaks, classifies the risk, proposes a mapping, and gives operators a safe path to resolution.

This MVP is not a general automation platform. It is a focused demonstration of adaptive integration reliability.

## Product Thesis for the MVP

The MVP should sell IntegraX as:

- a contract-aware integration platform
- a runtime that stays operational through upstream change
- a system that learns from operator decisions
- a multi-tenant control plane that explains what changed and what to do next

The MVP should not try to win on:

- workflow-builder breadth
- number of connectors
- marketplace size
- generic automation UX

## The 3 Ideal Connectors

### 1. Mercado Pago

Why:

- strong regional relevance
- concrete payments story
- schema changes are easy to understand in a demo
- already present in the repo

Role in demo:

- source system whose API shape changes between version A and version B

### 2. Contabilium

Why:

- creates a credible business workflow with invoices, customers, taxes, and ERP/accounting fields
- already present in the repo
- gives us high-value field mappings and drift scenarios

Role in demo:

- destination system that consumes mapped data

### 3. Email

Why:

- simple, reliable notification channel
- useful to demonstrate alerts, approvals, and escalation
- already present in the repo

Role in demo:

- operator notification and incident routing layer

## Optional alternative connector

If we want a simpler or more globally legible story, `google-sheets` can replace `contabilium` for early demos. It is less commercially differentiated, but easier for non-technical audiences to follow.

Recommended default for a sellable demo:

- Mercado Pago
- Contabilium
- Email

Recommended fallback for a lower-risk internal demo:

- Mercado Pago
- Google Sheets
- Email

## Exact Demo Flow

The demo must show one workflow and one controlled upstream change.

### Narrative

1. A tenant has an active integration that syncs payment or invoice data from Mercado Pago into Contabilium.
2. IntegraX has already ingested the current Mercado Pago contract and stored the baseline snapshot.
3. A new upstream contract appears or a runtime payload deviates from the baseline.
4. IntegraX detects the drift automatically.
5. The platform classifies the impact using the compatibility taxonomy.
6. Schema Bridge proposes the most likely mapping resolution and assigns a confidence score.
7. The control plane shows:
   - what changed
   - why it matters
   - whether production is safe
   - what mapping IntegraX recommends
8. The operator can accept the proposed mapping or escalate to review.
9. IntegraX stores the decision in mapping memory.
10. A new workflow run uses the updated mapping and succeeds.

### The exact change to demo

Use a deterministic, easy-to-explain contract drift:

- `customer_name` renamed to `payer_name`
- `total_amount` changed to `amount_total`
- enum change in `payment_status`
- one optional field becomes required

This gives enough surface to show:

- rename detection
- semantic similarity
- enum drift
- requiredness change
- confidence scoring
- human review thresholding

## MVP Architecture

```text
                   +-----------------------------+
                   |        Control Plane        |
                   | tenant view, incidents,     |
                   | mappings, explainability    |
                   +--------------+--------------+
                                  |
                                  v
                   +-----------------------------+
                   | Contract Intelligence       |
                   | ingest, snapshot, diff      |
                   +--------------+--------------+
                                  |
                                  v
                   +-----------------------------+
                   | Drift Engine                |
                   | classify safe/breaking      |
                   +--------------+--------------+
                                  |
                                  v
                   +-----------------------------+
                   | Schema Bridge               |
                   | mapping + confidence        |
                   +--------------+--------------+
                                  |
                                  v
                   +-----------------------------+
                   | Learning Loop               |
                   | store operator decision     |
                   +--------------+--------------+
                                  |
                                  v
                   +-----------------------------+
                   | Temporal Runtime            |
                   | execute sync workflow       |
                   +--------------+--------------+
                                  |
                                  v
                   +-----------------------------+
                   | Connector SDK + Connectors  |
                   | MP / Contabilium / Email    |
                   +-----------------------------+
```

## Minimum Modules to Implement First

### Mandatory for the MVP

1. `contract-intelligence`
2. `drift-engine`
3. `schema-bridge` V1 API
4. `learning-loop` persistence for accepted or rejected mappings
5. `integration-engine` plus one Temporal-backed workflow
6. minimal control-plane screens and APIs

### Can stay partial

- `connector-learning`
- advanced approvals
- tenant billing
- marketplace
- full embeddable builder

## Schema Bridge V1 Scope

The V1 engine does not need to solve all schema evolution. It needs to win the demo.

### Must exist

- field rename candidate detection
- string similarity plus alias/dictionary matching
- type compatibility classification
- enum shrink or rename detection
- optional-to-required detection
- mapping suggestion output
- confidence score output
- explanation output in plain operator language

### Nice to have but optional

- LLM-assisted disambiguation for low-confidence cases
- ontology enrichment
- cross-tenant memory weighting

### Out of scope

- autonomous end-to-end reconciliation without review
- broad natural-language schema understanding
- domain-specific reasoning beyond the chosen demo connectors

## Contract Intelligence: Mandatory Scope

### Must exist

- OpenAPI ingestion
- contract normalization
- version snapshot persistence
- diff against previous snapshot
- compatibility summary in the shared taxonomy
- linkage from diff result to affected connector/action/schema path

### Can be deferred

- AsyncAPI ingestion in the sellable MVP
- rich governance rulesets
- broad lineage explorer
- contract authoring UI

For the 4-6 week demo, OpenAPI is enough.

## Minimum Observability

The MVP only needs observability that helps sell confidence and risk reduction.

### Required

- drift incidents opened
- workflow runs by status
- mapping suggestions by confidence band
- accepted vs rejected suggestions
- time from drift detection to safe resolution
- connector reliability for the demo workflow

### Recommended dashboards

- one operator dashboard in the control plane
- one engineering dashboard for runtime and workflow health

## Minimum Control Plane UI

### Required screens

1. Tenant overview
2. Connectors and workflow summary
3. Contract or drift incident detail
4. Schema diff plus recommended mapping
5. Mapping memory history

### On the drift incident screen, show

- provider
- affected connector
- detected change summary
- severity class
- confidence score
- recommended mapping patch
- accept or reject action
- previous similar resolutions if they exist

### Do not build

- full workflow builder
- broad connector marketplace UI
- advanced user-management console
- full audit explorer

## What Can Be Simulated

The MVP should simulate aggressively where it does not weaken the core claim.

### Safe to simulate

- the upstream API change event source
- the changed OpenAPI spec versions
- sample runtime payloads before and after the change
- notification delivery details
- approval workflow depth
- multi-tenant volume at scale

### Do not simulate

- diff detection itself
- schema bridge suggestion logic
- confidence scoring
- memory persistence
- workflow recovery after mapping acceptance

The rule is simple: the intelligence must be real, the event source can be staged.

## Metrics to Demonstrate Value

The demo should show product metrics, not infra vanity metrics.

### Core value metrics

- drift detected before failed production run
- time to safe resolution
- suggested mapping accepted rate
- confidence score for proposed resolution
- number of manual edits avoided
- workflow continuity preserved after upstream change

### Supporting operational metrics

- workflow success rate
- connector reliability
- incident count by severity

## Functionality That Must Stay Out of MVP

- visual workflow builder
- public marketplace
- external connector submission model
- broad LLM-generated connectors
- AsyncAPI parity
- enterprise isolation modes
- advanced billing
- generic integration analytics suite
- cross-tenant automatic memory reuse

## Prioritized Backlog

### P0

1. Normalize one upstream OpenAPI contract into an internal contract model.
2. Persist baseline and changed contract snapshots.
3. Implement contract diff and compatibility classification.
4. Implement Schema Bridge V1 comparison plus confidence output.
5. Persist accepted or rejected mapping decisions in Postgres.
6. Run one Temporal workflow that uses the resolved mapping.
7. Expose one incident detail API and one mapping memory API.
8. Build one control-plane screen for drift incident review.

### P1

1. Add runtime payload drift correlation.
2. Add email alerting for drift incidents.
3. Add confidence history for the incident.
4. Add one more connector-backed scenario.
5. Add explainability text generation from structured signals.

### P2

1. Add operator notes and audit trail.
2. Add low-confidence escalation path.
3. Add per-tenant policy thresholds.
4. Add richer dashboarding and trend views.

## Suggested Weekly Timeline

### Week 1

- lock demo storyline
- choose the exact 2-connector workflow
- freeze compatibility taxonomy
- freeze the contract normalization shape
- define the Schema Bridge V1 response contract
- seed baseline and changed specs for the demo

### Week 2

- implement contract ingestion and snapshot persistence
- implement diff pipeline and severity classification
- stand up the drift incident model
- stub the control-plane incident API

### Week 3

- implement Schema Bridge V1
- compute mapping suggestion and confidence
- persist operator decisions in mapping memory
- expose explainability payloads

### Week 4

- wire Temporal workflow execution to resolved mappings
- prove successful run before and after accepted resolution
- add minimal control-plane screens
- add email notifications

### Week 5

- harden demo path end to end
- add observability metrics and dashboards
- test failure and recovery cases
- tighten language, severity labels, and explanations

### Week 6

- polish UX and demo script
- rehearse with deterministic staged inputs
- add one fallback scenario
- remove distractions and non-essential unfinished surfaces

## Demo Script Step by Step

### Opening

1. Show the tenant dashboard with one active integration: Mercado Pago to Contabilium.
2. Show that the workflow is currently healthy and using a known-good contract baseline.

### Trigger the change

3. Introduce a staged upstream contract change for Mercado Pago.
4. Run the contract check or show the scheduled detection run.

### Show the detection

5. Open the generated drift incident.
6. Show the classified changes:
   - rename
   - enum drift
   - requiredness change
7. Highlight the severity class and the affected workflow.

### Show the intelligence

8. Open the Schema Bridge recommendation.
9. Show the proposed field mappings and confidence score.
10. Show the explanation of why the rename is likely safe and why the enum drift needs review.

### Show human control

11. Accept the suggested mapping patch.
12. Show that the decision is stored in mapping memory.

### Show continuity

13. Re-run the workflow through Temporal.
14. Show successful execution with the updated mapping.
15. Show email notification or incident closure state.

### Closing statement

16. Summarize the value:
   - the API changed
   - IntegraX detected it automatically
   - production risk was classified before breakage
   - a mapping was proposed
   - operator effort was reduced
   - continuity was preserved

## Quick Wins: Technical

- turn current drift scripts into a reusable package boundary
- create a deterministic demo fixture pack for baseline and changed specs
- define one normalized contract model and use it everywhere
- create one shared incident DTO for control plane, drift engine, and schema bridge
- persist mapping memory immediately instead of relying on transient stores

## Quick Wins: Product

- use connector names and fields that business users recognize instantly
- phrase severity in operational language, not only technical language
- show one “before risk / after resolution” comparison in the UI
- measure and display “manual work avoided”
- keep the demo on one workflow and one clear upstream change

## Final MVP Definition

The sellable MVP of IntegraX is not:

- a broad automation platform
- a marketplace
- a visual builder

The sellable MVP is:

> a multi-tenant adaptive integration control plane that detects API contract changes, classifies operational risk, proposes mappings with confidence, records operator decisions, and keeps one critical workflow running through change.
