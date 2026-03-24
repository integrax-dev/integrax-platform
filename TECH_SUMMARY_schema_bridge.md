# TECH_SUMMARY - schema-bridge

**Branch:** `ID-0006-ag-api-schema-endpoints`
**Date:** 2026-03-24
**Status:** smoke test passing, `@integrax/schema-bridge` build passing, `@integrax/temporal-workflows` build passing

## What changed

### Deep arrays and probabilistic matching

`packages/schema-bridge/src/similarity-engine.ts`

- Kept the entropy/cardinality value matcher, but extended it to work better across heterogeneous systems and deep nested arrays.
- Added array-depth-aware bucketing so leaf fields inside nested arrays are compared first against candidates at the same array depth, with a same-type fallback when needed.
- Added business-type-aware confidence using `SchemaNode.format` and strong format classes such as `uuid`, `email`, `iso-currency`, `lat-lon`, `ar-cuit`, and `uri`.
- Added stronger probabilistic auto-accept rules for exact high-entropy overlaps and for high-confidence matches with strong business types.
- Result: cryptic fields, nested ERP array paths, and business identifiers now auto-match deterministically without relying on connector-specific hardcoding.

### Smart type inference

`packages/schema-bridge/src/schema-inferrer.ts`

- Extended value-driven format detection with business-oriented formats:
  - `iso-currency`
  - `lat-lon`
- Continued preserving repeated examples so entropy and cardinality are computed from real sample distributions, not deduplicated snapshots.
- Continued suppressing container-only object/array paths when deep descendants already exist, avoiding noisy diffs on complex nested structures.

### Confidence threshold / review workflow

`packages/schema-bridge/src/conflict-resolver.ts`

- Implemented a two-band decision policy for rename candidates:
  - `> 0.95`: auto-accepted deterministically
  - `0.70 - 0.95`: marked for human/LLM review in the diff result instead of being auto-resolved
- This keeps the engine aggressive for strong signals and conservative for mid-confidence cases.

### Smoke test level 2

`packages/schema-bridge/tests/smoke-test.ts`

- Expanded the smoke test to 4 acceptance scenarios:
  1. Flat SAP -> Coupa rename detection.
  2. Deep SAP IDOC-style arrays/segments -> nested API paths.
  3. Anti-false-positive scenario with repeated dates/placeholders that must not auto-map.
  4. ERP version upgrade scenario with simultaneous nested renames, UUID/email/currency/lat-lon business types, and multi-level arrays.

### API / orchestration state on this branch

`services/control-plane/src/routes/schemas.ts`
`services/control-plane/src/store/db.ts`

- Antigravity’s `ID-0006` work is now present on the same branch:
  - `/api/schemas/diff`
  - `/api/schemas/diff/status/:workflowId`
  - `/api/schemas/diff/reports/:id`
- Control plane can now trigger the Temporal workflow, poll it, and read persisted reports from Postgres.

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
Escenario 4: cambio de version ERP con nested renames simultaneos -> OK, sin LLM

RESULTADO: SUCCESS
```

Representative mappings now detected deterministically:

```text
BUKRS -> companyCode
WAERS -> currencyCode
IDOC.E1BPADDR1[*].CITY -> addresses[*].city
orders[*].order_uuid -> salesOrders[*].orderId
orders[*].buyer_email -> salesOrders[*].primaryContact.emailAddress
orders[*].ship_to -> salesOrders[*].destination.latLon
orders[*].items[*].sub_items[*].component_id -> salesOrders[*].lines[*].components[*].id
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
// packages/schema-bridge/src/conflict-resolver.ts
class ConflictResolver {
  resolveAll(diffs: FieldDiff[], options?: Partial<CompareOptions>): ResolvedConflict[]
}
```

## Notes for Antigravity

- The matcher is now closer to a universal multi-connector engine: it reasons over value distributions, business-type formats, and nested-array depth instead of connector-specific rules.
- Mid-confidence rename candidates are no longer silently auto-accepted; they surface as review/LLM items in the diff result.
- The branch now combines your API endpoints with the upgraded engine, so the next natural step is end-to-end validation from control-plane request -> Temporal workflow -> persisted report fetch.
