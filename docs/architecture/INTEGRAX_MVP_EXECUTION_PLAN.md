# IntegraX MVP Execution Plan

## Purpose

This document translates the MVP architecture into concrete work inside the current repository.

It is intentionally repo-specific. The goal is to answer:

- which folders we keep
- which files we extend
- which new modules we open now
- which endpoints and tables are already good enough
- what the first build sequence should be

## Current MVP Base Already in the Repo

The following foundations already exist and should be reused instead of rebuilt:

- schema diff workflow in `workflows/temporal/src/workflows/schema-diff-workflow.ts`
- schema diff persistence in `workflows/temporal/src/activities/schema-diff-repository.ts`
- schema diff API in `services/control-plane/src/routes/schemas.ts`
- mapping memory persistence in `services/control-plane/src/store/mapping-memory-repository.ts`
- admin screens for incidents, schema diffs, and mapping memory in `apps/admin-panel/src/pages/`
- schema bridge core in `packages/schema-bridge/src`
- connector implementations already present in `connectors/implementations/mercadopago`, `contabilium`, `email`

This means the shortest path is not "build the MVP". It is:

1. formalize module boundaries
2. close the happy-path demo
3. remove or isolate demo-only fallbacks where they weaken the story

## Repo Cut for the First Executable MVP

### Keep as-is and build on top

- `packages/schema-bridge`
- `packages/schema-bridge-piece`
- `packages/integration-engine`
- `workflows/temporal`
- `services/control-plane`
- `apps/admin-panel`
- `connectors/sdk/typescript`
- `connectors/implementations/mercadopago`
- `connectors/implementations/contabilium`
- `connectors/implementations/email`

### Promote into explicit service modules now

- `services/contract-intelligence`
- `services/drift-engine`
- `services/learning-loop`

### Treat as migration sources, not final module boundaries

- `services/connector-watchdog`
- `scripts/run-drift-check.ts`
- `scripts/verify-integration-surface.ts`

## MVP Data Model

The MVP can run on the tables already present plus a very small number of additions.

### Already present and usable

- `schema_inventory`
- `connector_schema_versions`
- `schema_diff_reports`
- `schema_sample_reservoir`
- `schema_mapping_memory`

These already support:

- contract snapshots
- versioning
- diff report persistence
- sample reservoir
- mapping memory

### Add next if missing from product flows

- `drift_incidents`
- `mapping_feedback_events`
- `confidence_events`

### Proposed minimal table shapes

`drift_incidents`

- `id`
- `tenant_id`
- `report_id`
- `connector_id`
- `workflow_id`
- `severity`
- `compatibility_class`
- `status`
- `title`
- `summary`
- `detected_at`
- `resolved_at`

`mapping_feedback_events`

- `id`
- `tenant_id`
- `report_id`
- `source_connector_id`
- `target_connector_id`
- `source_path`
- `target_path`
- `accepted`
- `confidence_at_decision`
- `created_at`
- `operator_user_id`

`confidence_events`

- `id`
- `tenant_id`
- `entity_type`
- `entity_id`
- `from_confidence`
- `to_confidence`
- `reason`
- `created_at`

## MVP API Surface

### Already present and should be kept

In `services/control-plane/src/routes/schemas.ts`:

- `POST /api/schemas/diff`
- `GET /api/schemas/status/:workflowId`
- `GET /api/schemas/reports`
- `GET /api/schemas/reports/:id`
- `POST /api/schemas/reports/:reportId/feedback`
- `GET /api/schemas/memory`

### Add immediately for the sellable demo

In a new `services/control-plane/src/routes/incidents.ts`:

- `GET /api/incidents`
- `GET /api/incidents/:id`
- `POST /api/incidents/:id/resolve`
- `POST /api/incidents/:id/dismiss`

In a new or expanded `services/control-plane/src/routes/metrics.ts`:

- `GET /api/metrics/drift-summary`
- `GET /api/metrics/schema-bridge-summary`
- `GET /api/metrics/workflow-health`

### Avoid for MVP

- generic public connector registry APIs
- builder APIs
- marketplace APIs
- advanced approval workflow APIs

## UI Surface to Close First

### Existing pages to convert from partial/demo to MVP path

- `apps/admin-panel/src/pages/SchemaDiffs.tsx`
- `apps/admin-panel/src/pages/MappingMemory.tsx`
- `apps/admin-panel/src/pages/Incidents.tsx`
- `apps/admin-panel/src/pages/Dashboard.tsx`

### MVP screen responsibilities

`Dashboard.tsx`

- one tenant summary
- one healthy workflow card
- one active drift incident card
- one confidence trend tile

`SchemaDiffs.tsx`

- list reports
- show mapping recommendations
- show severity and compatibility class
- accept or reject suggestion

`MappingMemory.tsx`

- inspect learned mappings for one connector pair
- show acceptance ratio and average confidence

`Incidents.tsx`

- show open incidents
- show severity, workflow impact, and recommended action
- resolve or dismiss incident

### Do not spend time on

- Settings polish
- broad tenant-management UX
- advanced audit UX
- broad connector configuration UX

## Execution Ownership by Folder

### Workstream 1: Contract Intelligence

Create:

- `services/contract-intelligence/src/index.ts`
- `services/contract-intelligence/src/types.ts`
- `services/contract-intelligence/src/normalize.ts`
- `services/contract-intelligence/src/diff.ts`

First responsibility:

- normalize incoming OpenAPI snapshots into one internal shape
- produce a diff summary consumable by drift-engine and control-plane

Initial implementation source:

- pull concepts from `scripts/verify-integration-surface.ts`
- do not import from scripts once the service exists

### Workstream 2: Drift Engine

Create:

- `services/drift-engine/src/index.ts`
- `services/drift-engine/src/incidents.ts`
- `services/drift-engine/src/classify.ts`

Initial implementation source:

- extract or wrap from `services/connector-watchdog/src`

First responsibility:

- convert contract diff output into drift incidents with severity and compatibility class

### Workstream 3: Learning Loop

Create:

- `services/learning-loop/src/index.ts`
- `services/learning-loop/src/types.ts`
- `services/learning-loop/src/confidence.ts`

Initial implementation source:

- use `services/control-plane/src/store/mapping-memory-repository.ts`
- use `packages/schema-bridge/src/mapping-memory-provider.ts`

First responsibility:

- define one canonical feedback event model
- persist mapping decisions and confidence changes

### Workstream 4: Control Plane

Modify:

- `services/control-plane/src/server.ts`
- `services/control-plane/src/routes/schemas.ts`
- `services/control-plane/src/routes/admin.ts`

Create:

- `services/control-plane/src/routes/incidents.ts`
- `services/control-plane/src/routes/metrics.ts`

First responsibility:

- expose the MVP APIs cleanly
- keep routes thin and move domain logic into services

### Workstream 5: Admin Panel

Modify:

- `apps/admin-panel/src/pages/SchemaDiffs.tsx`
- `apps/admin-panel/src/pages/Incidents.tsx`
- `apps/admin-panel/src/pages/MappingMemory.tsx`
- `apps/admin-panel/src/pages/Dashboard.tsx`

First responsibility:

- remove weak mock-only framing from MVP path
- connect to real APIs already exposed by `control-plane`

### Workstream 6: Temporal Path

Modify:

- `workflows/temporal/src/workflows/schema-diff-workflow.ts`
- `workflows/temporal/src/activities/schema-diff-activities.ts`
- `workflows/temporal/src/activities/schema-diff-repository.ts`

First responsibility:

- guarantee the happy path for:
  - diff generation
  - report persistence
  - memory update
  - workflow rerun after operator acceptance

## First Coding Batch

This is the first practical implementation batch to execute without broadening scope.

### Batch A

1. scaffold `contract-intelligence`, `drift-engine`, and `learning-loop`
2. add `incidents` routes in control plane
3. define shared incident DTOs and compatibility enums

### Batch B

1. wire incident creation from persisted schema diff reports
2. feed `Incidents.tsx` from real APIs
3. show severity, compatibility class, confidence, and workflow impact

### Batch C

1. store explicit mapping feedback events
2. expose confidence history
3. show “before / after resolution” in admin panel

### Batch D

1. demo seed scripts for Mercado Pago -> Contabilium drift scenario
2. dashboard tiles for drift summary and safe resolution time
3. tighten copy and operator explanations

## Definition of Done for the Sellable MVP

The MVP is done when all of this is true:

1. a staged upstream contract change creates a persisted report
2. that report creates or updates an incident visible in the admin panel
3. schema bridge returns a mapping proposal with confidence
4. operator acceptance persists to mapping memory
5. the workflow can be run again successfully using the accepted mapping
6. the UI can show the full narrative without depending on fake backend state

## Immediate Risks to Avoid

- do not create a second parallel schema diff path
- do not add more connectors before the primary story is finished
- do not let scripts remain the primary integration point
- do not add broad UI scope outside dashboard, incidents, schema diffs, and mapping memory
- do not hide weak spots with excessive mocks on the MVP path

## Immediate Next Step

Open the missing service modules and keep all new work behind those boundaries:

- `contract-intelligence`
- `drift-engine`
- `learning-loop`

That is the smallest move that converts the current repo from "promising prototype" into an architecture we can actually scale.
