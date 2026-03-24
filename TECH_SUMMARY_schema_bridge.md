# TECH_SUMMARY - schema-bridge

**Branch:** `ID-0003-ag-contract-schema-bridge`
**Date:** 2026-03-24
**Status:** `packages/schema-bridge/tests/smoke-test.ts` passing, `@integrax/schema-bridge` build passing, `@integrax/temporal-workflows` build passing

## What changed

### Engine

`packages/schema-bridge/src/similarity-engine.ts`

- Added value-based matching as a first-class signal using `SchemaNode.examples`.
- Kept the engine deterministic: a strong value overlap now resolves SAP -> Coupa renames without relying on connector-specific dictionaries.
- Added type-bucketing in `findRenameCandidates()` so removed fields only compare against added fields of compatible primary JSON type.
- Updated the smoke test data to use 3 realistic SAP/Coupa samples with distinctive alphanumeric values (`NA-Corp`, `SUP-000100`, `EUR`, etc.), proving the match is driven by values rather than a hardcoded SAP synonym list.

`packages/schema-bridge/src/types.ts`

- Extended `SimilarityScore` with the `value` dimension so downstream consumers can inspect how much of the confidence came from sample overlap.

### Orchestration brought from Antigravity

`workflows/temporal/src/activities/schema-diff-activities.ts`

- Brought in the Temporal activity that infers fingerprints, checks Redis, runs `SchemaBridge.compare()`, and caches the normalized `DiffResult` for 30 days.

`workflows/temporal/src/workflows/schema-diff-workflow.ts`

- Brought in the workflow that calls `generateSchemaDiff()`, persists the result, and returns the standardized diff payload.

### Compatibility fix

`packages/schema-bridge/src/client-updater.ts`
`workflows/temporal/src/activities/schema-diff-activities.ts`

- Fixed the `ioredis` constructor import shape so both packages compile under the current `NodeNext` TypeScript setup.

## Validation

Command:

```bash
npx tsx packages/schema-bridge/tests/smoke-test.ts
```

Observed result:

```text
[100.0%] BUKRS -> companyCode
[100.0%] LIFNR -> supplierNumber
[100.0%] NAME1 -> supplierName
[100.0%] ORT01 -> city
[100.0%] WAERS -> currencyCode

0 LLM escalations
100% coverage
RESULTADO: SUCCESS
```

Additional verification:

```bash
pnpm --filter @integrax/schema-bridge build
pnpm --filter @integrax/temporal-workflows build
```

Both builds pass.

## Main function signatures

```ts
// packages/schema-bridge/src/bridge.ts
class SchemaBridge {
  constructor(config?: SchemaBridgeConfig)
  compare(request: CompareSchemasRequest): Promise<BridgeReport>
  toMarkdown(report: BridgeReport): string
}

function createSchemaBridge(config?: SchemaBridgeConfig): SchemaBridge
```

```ts
// packages/schema-bridge/src/similarity-engine.ts
class SimilarityEngine {
  findRenameCandidates(
    removed: FieldDiff[],
    added: FieldDiff[],
    threshold?: number
  ): FieldDiff[]

  score(nameA: string, nameB: string): SimilarityScore
}

interface SimilarityScore {
  levenshtein: number
  jaccard: number
  semantic: number
  value: number
  combined: number
}
```

```ts
// workflows/temporal/src/activities/schema-diff-activities.ts
function generateSchemaDiff(
  input: SchemaDiffInput & { options?: { forceRecalculate?: boolean } }
): Promise<DiffResult>

function persistDiffResult(result: DiffResult): Promise<void>
```

```ts
// workflows/temporal/src/workflows/schema-diff-workflow.ts
function schemaDiffWorkflow(input: SchemaDiffWorkflowInput): Promise<DiffResult>
```

## Notes for Antigravity

- The engine currently resolves the SAP smoke test from sample values, not from a SAP-specific dictionary.
- Redis caching now lives at the Temporal orchestration layer, keyed by inferred schema fingerprints.
- `ClientUpdater` still publishes notifications in a fire-and-forget way and degrades gracefully if Redis is unavailable.
