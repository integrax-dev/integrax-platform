# TECH_SUMMARY - schema-bridge

**Branch:** `ID-0006-ag-api-schema-endpoints`  
**Date:** 2026-03-24  
**Status:** smoke test passing, `@integrax/schema-bridge` build passing, `@integrax/temporal-workflows` build passing

## What changed

### 1. Business type registry and injectable semantics

New file: `packages/schema-bridge/src/business-type-registry.ts`

- Moved business-type detection out of the inferrer core into a reusable registry.
- Added default providers for:
  - `uuid`
  - `email`
  - `iso-currency`
  - `lat-lon`
  - `phone-e164`
  - `country-iso2`
  - `country-iso3`
  - `uri`
  - `date`
  - `date-time`
  - `ar-cuit`
- Added injectable weights so connector/domain teams can bias confidence without hardcoding more logic into the engine.

### 2. Smarter inferrer

`packages/schema-bridge/src/schema-inferrer.ts`

- `SchemaInferrer` now accepts `businessTypeProviders`.
- String format detection now delegates to the registry first, then falls back to money-string inference.
- Repeated `examples` are still preserved so entropy/cardinality work over real distributions instead of deduplicated values.
- Deep container nodes are still suppressed when descendant leaf paths already exist, which keeps nested diffs clean.

### 3. Similarity engine rebuilt around relative evidence

`packages/schema-bridge/src/similarity-engine.ts`

- Added acronym-safe normalization so fields like `FNAME`, `LNAME`, `WAERS`, `MATNR` are no longer mangled into character-by-character tokens.
- Added probabilistic value scoring with:
  - overlap ratio
  - Shannon entropy
  - cardinality
  - diversity ratio
  - intrinsic token information
  - soft token reliability penalties instead of hard ignores
- Numeric/date/placeholder values are no longer discarded. They are downweighted mathematically.
- Added structural similarity over deep array paths and parent context so flatten/unflatten cases score better.
- Added multi-stage bucketing:
  - exact type + array depth + array context
  - same type + same depth
  - same primary type fallback
- Added `margin` and `reciprocalMargin` to `SimilarityScore` so each candidate carries top1-vs-top2 separation on both source and target sides.
- Expanded semantic support for acronyms and common enterprise aliases such as `website`, `fname/lname`, `qty_value`.

### 4. Conflict resolution now uses margin, not only absolute threshold

`packages/schema-bridge/src/conflict-resolver.ts`

- `ConflictResolver` now accepts:
  - `autoAcceptThreshold`
  - `humanReviewThreshold`
  - `minConfidenceMargin`
- High-confidence rename acceptance now uses:
  - absolute score, and/or
  - relative dominance over the runner-up candidate
- This removed the previous over-reliance on a single hard `0.95` rule.
- Strong value matches with real margin now auto-resolve without escalating to LLM.

### 5. Bridge wiring and exports

`packages/schema-bridge/src/bridge.ts`  
`packages/schema-bridge/src/index.ts`  
`packages/schema-bridge/src/types.ts`

- `SchemaBridgeConfig` now supports:
  - `businessTypeProviders`
  - `businessTypeWeights`
  - `confidenceMarginThreshold`
  - `autoAcceptThreshold`
  - `humanReviewThreshold`
- `SchemaBridge` now passes those settings into:
  - `SchemaInferrer`
  - `SimilarityEngine`
  - `ConflictResolver`
- Exported the registry and new config/types from the package entrypoint.

## Smoke test expansion

`packages/schema-bridge/tests/smoke-test.ts`

- Replaced the old 4-case smoke test with a broader acceptance suite.
- Current smoke result:
  - 28 scenarios total
  - 24 scenarios based on official vendor documentation
  - deep arrays, nested objects, acronyms, currencies, URIs, UUIDs, phones, emails, and hostile false-positive controls
- All official scenarios completed without LLM escalation.

### Official-source-inspired scenarios now covered

- Stripe
- Shopify
- HubSpot
- Salesforce
- Microsoft Dataverse
- QuickBooks
- Xero
- Zoho CRM
- Freshdesk
- Mailchimp
- BigCommerce
- Square
- Twilio SendGrid
- Adobe Marketo
- Notion
- GitLab
- Slack
- Asana
- Intercom
- Microsoft Graph
- FreshBooks
- Jira Cloud
- Okta
- Google Merchant

## Validation

Commands executed:

```bash
npx tsx packages/schema-bridge/tests/smoke-test.ts
pnpm --filter @integrax/schema-bridge build
pnpm --filter @integrax/temporal-workflows build
```

Observed smoke result:

```text
RESULTADO: SUCCESS. El motor resolvio 28 escenarios; 24 casos basados en documentacion oficial quedaron resueltos sin LLM y el escenario negativo de false positives evito renombrados incorrectos.
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
// packages/schema-bridge/src/schema-inferrer.ts
class SchemaInferrer {
  constructor(config?: SchemaInferrerConfig)
  infer(samples: Record<string, unknown>[]): InferredJsonSchema
}

function createSchemaInferrer(config?: SchemaInferrerConfig): SchemaInferrer
```

```ts
// packages/schema-bridge/src/similarity-engine.ts
class SimilarityEngine {
  constructor(config?: SimilarityEngineConfig)
  findRenameCandidates(
    removed: FieldDiff[],
    added: FieldDiff[],
    threshold?: number
  ): FieldDiff[]

  score(nameA: string, nameB: string): SimilarityScore
}

function createSimilarityEngine(config?: SimilarityEngineConfig): SimilarityEngine

interface SimilarityScore {
  levenshtein: number
  jaccard: number
  semantic: number
  value: number
  combined: number
  margin?: number
  reciprocalMargin?: number
}
```

```ts
// packages/schema-bridge/src/conflict-resolver.ts
class ConflictResolver {
  constructor(config?: ConflictResolverConfig)
  resolveAll(diffs: FieldDiff[], options?: Partial<CompareOptions>): ResolvedConflict[]
}

function createConflictResolver(config?: ConflictResolverConfig): ConflictResolver
```

```ts
// packages/schema-bridge/src/business-type-registry.ts
function detectBusinessFormat(
  value: string,
  fieldPath: string,
  providers: BusinessTypeProvider[]
): string | undefined

const defaultBusinessTypeProviders: BusinessTypeProvider[]
const defaultBusinessTypeWeights: BusinessTypeWeightMap
```

## Notes for Antigravity

- The engine is materially less brittle than the previous threshold-only version.
- It now supports ontology-style injection points without forcing every new business type into a monolithic regex block.
- The decision policy is no longer “high absolute score only”; it uses relative dominance, which was the main architectural criticism.
- The current remaining weakness is not the happy path anymore, but broader adversarial evaluation:
  - sparse/null-heavy windows
  - zero-overlap temporal slices
  - multiple competing high-entropy IDs in the same entity
  - end-to-end validation through the new API endpoints and persisted reports
