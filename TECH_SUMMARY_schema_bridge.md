# TECH_SUMMARY - schema-bridge

**Branch:** `ID-0005-ag-db-persistence`
**Date:** 2026-03-24
**Status:** smoke test passing, `@integrax/schema-bridge` build passing, `@integrax/temporal-workflows` build passing

## What changed

### Engine hardening

`packages/schema-bridge/src/similarity-engine.ts`

- Hardened value-based matching to reduce false positives from weak sample signals.
- Value matching now ignores low-signal string values such as pure numerics, decimal-like numbers, dates/date-times, and placeholders like `N/A`, `null`, `unknown`, `true`, `false`.
- Value similarity now requires diversity on both sides and at least two overlapping distinctive values before contributing to a rename candidate.
- Rebalanced the final score so lexical similarity still works on its own, while high-quality value overlap remains the dominant signal for SAP-style cryptic field names.

### Nested structure cleanup

`packages/schema-bridge/src/schema-inferrer.ts`

- Increased preserved unique examples per field from 3 to 10 to strengthen the value signal.
- Stopped emitting container-only object/array paths when they already have descendant leaf paths. This removes noisy diffs like `IDOC`, `E1BPADDR1`, `addresses`, `items`, etc., while keeping deep leaf paths such as `IDOC.E1BPADDR1[*].CITY`.
- Result: deep SAP segments now map cleanly without extra LLM escalations caused by unmatched container nodes.

### Updated smoke coverage

`packages/schema-bridge/tests/smoke-test.ts`

- Expanded the smoke test from a single flat SAP/Coupa case to 3 acceptance scenarios:
  1. Flat SAP -> Coupa rename detection.
  2. Deep SAP IDOC-style arrays/segments -> nested API paths.
  3. Anti-false-positive scenario with repeated dates/placeholders that must not auto-map.

### Orchestration state from Antigravity

`workflows/temporal/src/activities/schema-diff-activities.ts`

- Kept Antigravity's Redis cache and Postgres persistence work in place.
- Fixed the `ioredis` import shape so the Temporal package compiles cleanly under the current TypeScript setup.

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

Representative nested mappings now detected deterministically:

```text
IDOC.E1BPADDR1[*].CITY -> addresses[*].city
IDOC.E1BPADDR1[*].POST_CODE -> addresses[*].postalCode
IDOC.E1BPMATERIAL[*].MATNR -> items[*].productCode
IDOC.E1BPMATERIAL[*].MAKTX -> items[*].description
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

- The engine now resolves both flat and deep SAP mappings from sample values, not from a connector-specific SAP dictionary.
- Container nodes are intentionally suppressed from the inferred field list when deep descendants already exist, to avoid noisy `field_added` / `field_removed` diffs on nested structures.
- The anti-false-positive hardening is conservative by design: repeated dates/placeholders no longer count as a valid identity signal.
