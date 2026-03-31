# TECH_SUMMARY - schema-bridge hardening + adversarial validation

**Branch:** `ID-0008-ag-schema-bridge-integration`  
**Date:** 2026-03-24  
**Status:** smoke test passing, adversarial suite passing, `@integrax/schema-bridge` / `@integrax/temporal-workflows` / `@integrax/control-plane` builds passing

## What changed

### 1. Richer inference and stronger schema identity

`packages/schema-bridge/src/schema-inferrer.ts`  
`packages/schema-bridge/src/types.ts`

- Raised retained field examples from a hardcoded `10` to configurable `maxExamples` with default `50`.
- Added explicit evidence metadata per field:
  - `sampleCount`
  - `nonNullCount`
  - `nullCount`
  - `uniqueCount`
  - `coverageRatio`
  - `placeholderCount`
  - `placeholderRatio`
  - `evidenceQuality`
- Kept repeated examples instead of deduplicating them so entropy/cardinality work over real observed distributions.
- Increased schema fingerprint length from 16 hex chars to 32.

### 2. Ontology moved out of the core matcher

`packages/schema-bridge/src/ontology-registry.ts`  
`packages/schema-bridge/src/index.ts`  
`packages/schema-bridge/src/types.ts`

- Added injectable `OntologyProvider` support.
- Moved generic semantic aliases out of `SimilarityEngine` core into a default ontology layer.
- Removed the legacy hardcoded field map from `ConflictResolver`.
- Current default ontology covers common cross-system aliases such as:
  - `fname/lname`
  - `qty_value`
  - `username`
  - `login_name`
  - `account_ref`
  - `nick_name`
  - generic bilingual field families (`name`, `email`, `phone`, `currency`, etc.)

### 3. Similarity engine rebuilt around explicit evidence

`packages/schema-bridge/src/similarity-engine.ts`

- Replaced opaque “one weighted average” behavior with named evidence channels:
  - lexical
  - value distribution
  - structural/path-context
  - business type
  - ontology
  - evidence sufficiency
- Added path-context structural matching for deep arrays and flatten/unflatten cases instead of relying only on array depth.
- Added decision metadata on each candidate:
  - `decision`
  - `evidenceBreakdown`
  - `evidenceQuality`
  - `margin`
  - `reciprocalMargin`
- Auto-accept is now gated by corroborated evidence and competitive separation, not only by a raw score threshold.
- High-entropy types like `uuid`, `email`, `iso-currency`, `phone-e164`, `lat-lon` now boost confidence only when corroborated by value/ontology/structure.

### 4. Conflict resolution respects evidence policy

`packages/schema-bridge/src/conflict-resolver.ts`  
`packages/schema-bridge/src/bridge.ts`

- `ConflictResolver` no longer contains domain-specific legacy mappings.
- Rename acceptance now honors:
  - `decision` emitted by the similarity engine
  - absolute confidence
  - dominant and reciprocal margins
  - strong ontology/business-type evidence where appropriate
- `SchemaBridgeConfig` now supports:
  - `maxExamples`
  - `ontologyProviders`
  - existing `businessTypeProviders`
  - threshold tuning already present for confidence/review

### 5. Persistence hardened for retry safety

`workflows/temporal/src/activities/schema-diff-activities.ts`

- Refactored persistence into explicit transactional helpers:
  - `persistDiffResultTransactional`
  - `ensureConnectorVersion`
- Kept schema inventory upsert, connector version updates and diff report upsert inside one transaction.
- Version creation is idempotent across retries: same fingerprint does not create duplicate versions.
- Redis and Postgres clients are now initialized lazily, which avoids connection side effects during tests/imports.
- Cache key version bumped to `v2` to reflect the new fingerprint/evidence model.

## Validation split

### Business smoke suite

`packages/schema-bridge/tests/smoke-test.ts`

- Kept the smoke suite focused on happy-path business coverage.
- Current result:
  - `27` total scenarios
  - `24` official vendor/API scenarios
  - deep SAP arrays and nested restructure cases passing without LLM

### Adversarial suite

`packages/schema-bridge/tests/adversarial-test.ts`

- Added a separate adversarial suite that fails only on incorrect `auto_accept`.
- Included hostile cases for:
  - sparse data windows
  - placeholder swamping
  - zero-overlap windows
  - multiple high-entropy IDs
  - flattened vs nested structures
  - sparse arrays
  - mixed-type noise
  - low-entropy collisions
- Current adversarial result:
  - `incorrectAutoAccepts: 0`
  - ambiguous cases fall into review/reject instead of overconfident mappings

## Integration coverage added

`workflows/temporal/src/__tests__/schema-diff-activities.test.ts`

- Covers:
  - idempotent retry of the same diff persistence
  - rollback on mid-transaction failure
  - version increment only when fingerprint changes

`services/control-plane/src/routes/schemas.test.ts`

- Covers fetch of a persisted schema diff report through the control-plane API path:
  - `GET /api/schemas/reports/:id`

## Commands verified

```bash
npx tsx packages/schema-bridge/tests/smoke-test.ts
npx tsx packages/schema-bridge/tests/adversarial-test.ts
pnpm --filter @integrax/schema-bridge build
pnpm --filter @integrax/temporal-workflows test
pnpm --filter @integrax/temporal-workflows build
pnpm --filter @integrax/control-plane test
pnpm --filter @integrax/control-plane build
```

## Key interfaces now exposed

```ts
interface FieldEvidence {
  sampleCount: number
  nonNullCount: number
  nullCount: number
  uniqueCount: number
  coverageRatio: number
  placeholderCount: number
  placeholderRatio: number
  evidenceQuality: number
}

interface OntologyProvider {
  id: string
  match(context: OntologyMatchContext): OntologyMatch | null
}

interface SimilarityScore {
  levenshtein: number
  jaccard: number
  semantic: number
  value: number
  combined: number
  margin?: number
  reciprocalMargin?: number
  decision?: 'auto_accept' | 'review' | 'reject'
  evidenceQuality?: number
  evidenceBreakdown?: SimilarityEvidenceBreakdown
}
```

## Notes for Antigravity

- The engine is now much less “heurística vestida de matemáticas” than before, but it is still a rule-based deterministic matcher, not a learned probabilistic model.
- The happy path is broad and green.
- The adversarial suite now gives an explicit resilience signal instead of mixing hostile cases into smoke.
- Remaining open risk is not day-1 correctness on covered vendors, but whether the current ontology/evidence policy should keep expanding in-rule or eventually move to a trained/ranked model.
