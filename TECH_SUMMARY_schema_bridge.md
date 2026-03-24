# TECH_SUMMARY - schema-bridge

**Branch:** `ID-0005-ag-db-persistence`
**Date:** 2026-03-24
**Status:** smoke test passing, `@integrax/schema-bridge` build passing, `@integrax/temporal-workflows` build passing

## What changed

### Entropy-based value matching

`packages/schema-bridge/src/similarity-engine.ts`

- Rebuilt the value-based matcher around probabilistic scoring instead of hard ignores.
- The engine no longer discards pure numerics, dates, or `size === 1` samples. Every observed value can contribute, but its contribution is weighted mathematically by:
  - overlap ratio between source and target examples
  - Shannon entropy of the sample distribution
  - cardinality of distinct observed values
  - intrinsic information of the token itself (length, character diversity, mixed shape)
  - type/format reliability (booleans and dates are downweighted, not ignored)
- Result: a long repeated foreign key now produces a materially higher score than a repeated `"1"`, while short but distinctive codes like `EUR` still contribute enough to map correctly.

### Nested structure cleanup

`packages/schema-bridge/src/schema-inferrer.ts`

- Preserved up to 10 examples per field including repeated values, so entropy/cardinality are computed from real sample distributions instead of deduplicated snapshots.
- Suppressed container-only object/array paths when deeper descendants already exist. This removes noisy diffs like `IDOC`, `E1BPADDR1`, `addresses`, `items`, etc., while preserving deep leaf paths such as `IDOC.E1BPADDR1[*].CITY`.
- Result: deep SAP segments now map cleanly without extra LLM escalations caused by unmatched container nodes.

### Smoke coverage

`packages/schema-bridge/tests/smoke-test.ts`

- Expanded the smoke test to 3 acceptance scenarios:
  1. Flat SAP -> Coupa rename detection.
  2. Deep SAP IDOC-style arrays/segments -> nested API paths.
  3. Anti-false-positive scenario with repeated dates/placeholders that must not auto-map.

### Orchestration and architecture state

`workflows/temporal/src/activities/schema-diff-activities.ts`

- Kept Antigravity's Redis cache and Postgres persistence work in place.
- Fixed the `ioredis` import shape so the Temporal package compiles cleanly under the current TypeScript setup.

`docs/architecture/multi-connector-vision.md`

- Added the cross-connector architecture vision document describing the schema-first, entropy-driven, Temporal-orchestrated direction for enterprise plug-and-play integrations.

## Validation

Commands executed:

```bash
npx tsx packages/schema-bridge/tests/smoke-test.ts
pnpm --filter @integrax/schema-bridge build
pnpm --filter @integrax/temporal-workflows build
```

Observed smoke result:

```text
Escenario 1: SAP plano vs Coupa -> OK, sin LLM
Escenario 2: SAP profundo con segmentos/arrays -> OK, sin LLM
Escenario 3: hardening contra falsos positivos -> OK, sin matches falsos por fechas/placeholders

RESULTADO: SUCCESS
```

Representative mappings now detected deterministically:

```text
BUKRS -> companyCode
WAERS -> currencyCode
IDOC.E1BPADDR1[*].CITY -> addresses[*].city
IDOC.E1BPADDR1[*].POST_CODE -> addresses[*].postalCode
IDOC.E1BPMATERIAL[*].MATNR -> items[*].productCode
```

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
// packages/schema-bridge/src/schema-inferrer.ts
class SchemaInferrer {
  infer(samples: Record<string, unknown>[]): InferredJsonSchema
}
```

```ts
// workflows/temporal/src/activities/schema-diff-activities.ts
function generateSchemaDiff(
  input: SchemaDiffInput & { options?: { forceRecalculate?: boolean } }
): Promise<DiffResult>

function persistDiffResult(result: DiffResult): Promise<void>
```

## Notes for Antigravity

- The engine now scores every observed value probabilistically instead of discarding whole classes of values up front.
- Container nodes are intentionally suppressed from the inferred field list when deep descendants already exist, to avoid noisy nested diffs.
- The entropy/cardinality model is now aligned with the multi-connector vision: the matcher reasons over JSON samples and statistical signals, not SAP-specific hardcoding.
