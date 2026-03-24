# TECH_SUMMARY — @integrax/schema-bridge (Week 1 Delivery)

**Branch:** `ID-0003-ag-contract-schema-bridge`
**Date:** 2026-03-24
**Status:** ✅ Smoke test passing — `RESULTADO: SUCCESS`

---

## What was added / changed

### `packages/schema-bridge/src/similarity-engine.ts`

Two changes to make the engine correctly resolve SAP ERP ↔ Coupa/modern API field mappings:

1. **SAP synonym dictionary** — Added a new block of `SYNONYM_PAIRS` for SAP ABAP field codes:
   - `BUKRS` ↔ `companyCode` / `company_code`
   - `LIFNR` ↔ `supplierNumber` / `supplier_number` / `vendorNumber`
   - `NAME1` ↔ `supplierName` / `supplier_name` / `companyName`
   - `ORT01` ↔ `city` / `ciudad`
   - `WAERS` ↔ `currencyCode` / `currency_code` / `currency`
   - `MATNR` ↔ `materialCode` / `productCode`
   - `MENGE` ↔ `quantity` / `cantidad`
   - `WERKS` ↔ `plant` / `plantCode`
   - `KUNNR` ↔ `customerNumber`
   - `VKORG` ↔ `salesOrg` / `sales_organization`

2. **Combined score formula fix** — A direct synonym lookup (`semantic = 1.0`) now yields `combined = 1.0`, bypassing the weighted average. Without this fix, SAP codes like `BUKRS` (normalizes to `b_u_k_r_s`) scored only ~0.36 combined against `company_code` despite being a known synonym, falling below the 0.70 threshold.

---

## Smoke test result

```
npx tsx packages/schema-bridge/tests/smoke-test.ts

[100.0%] BUKRS  ->  companyCode (rename)
[100.0%] LIFNR  ->  supplierNumber (rename)
[100.0%] NAME1  ->  supplierName (rename)
[100.0%] ORT01  ->  city (rename)
[100.0%] WAERS  ->  currencyCode (rename)

✅ 0 dependencias al LLM. 100% coverage.
✅ RESULTADO: SUCCESS.
```

---

## Key function signatures (for Antigravity / Temporal Activities)

```typescript
// packages/schema-bridge/src/bridge.ts
class SchemaBridge {
  constructor(config?: SchemaBridgeConfig)
  compare(request: CompareSchemasRequest): Promise<BridgeReport>
  toMarkdown(report: BridgeReport): string
}

function createSchemaBridge(config?: SchemaBridgeConfig): SchemaBridge

// packages/schema-bridge/src/similarity-engine.ts
class SimilarityEngine {
  findRenameCandidates(
    removed: FieldDiff[],
    added: FieldDiff[],
    threshold?: number   // default 0.70
  ): FieldDiff[]

  score(nameA: string, nameB: string): SimilarityScore
}

// SimilarityScore shape
interface SimilarityScore {
  levenshtein: number   // 0–1
  jaccard: number       // 0–1
  semantic: number      // 0–1 (1.0 = direct synonym match)
  combined: number      // 1.0 when semantic=1.0 (synonym), else weighted avg
}
```

### `CompareSchemasRequest` (input to `bridge.compare()`)
```typescript
{
  connectorAId: string
  connectorBId: string
  samplesA: Record<string, unknown>[]   // 1–50 samples
  samplesB: Record<string, unknown>[]
  tenantId?: string
  options?: {
    renameSimilarityThreshold?: number   // default 0.70
    enableLlmEscalation?: boolean        // default false
    maxLlmEscalations?: number           // default 3
  }
}
```

### `BridgeReport` (output)
```typescript
{
  id: string                          // "br_<ulid>"
  connectorAId: string
  connectorBId: string
  inferredSchemaA: InferredJsonSchema
  inferredSchemaB: InferredJsonSchema
  diffs: FieldDiff[]
  mappings: FieldMapping[]            // pathA, pathB, transform, confidence
  resolvedConflicts: ResolvedConflict[]
  requirementsReport: RequirementsReport
  generatedTransformTs: string        // ready-to-use TS function A→B
  generatedAt: string                 // ISO timestamp
}
```

---

## Architecture notes for Antigravity

- The engine is **fully deterministic** for known synonyms (no LLM calls unless `enableLlmEscalation: true`).
- `generateSchemaDiff` in `workflows/temporal/src/activities/schema-diff-activities.ts` wraps `SchemaBridge.compare()` with Temporal heartbeats. Antigravity can call that Activity from any Workflow.
- Output contract is validated against `contracts/schemas/schema-diff.schema.json`.
- `ClientUpdater` fires Redis pub/sub notifications on each `compare()` (fire-and-forget, non-fatal if Redis is absent).

---

## Next steps (suggested for Week 2)

- [ ] Expand synonym dictionary with TiendaNube, MercadoLibre, AFIP-specific field codes
- [ ] Nested object support (SAP IDOC segments like `E1BPADDR1`)
- [ ] Persist `BridgeReport` to Postgres for audit trail
