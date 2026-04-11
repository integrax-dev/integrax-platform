# Differential Engines

IntegraX has two independent engines for detecting divergence. They serve different purposes and must remain separate.

---

## schema-bridge (`packages/schema-bridge`)

**What it detects:** Technical/schema drift between two connector schemas.

**Input:** Data samples from two systems (or pre-inferred schemas).

**Output:** `BridgeReport` with:
- `diffs` — field-level differences (added, removed, renamed, type changed, format changed, nullability changed)
- `mappings` — auto-generated field-to-field transform spec
- `generatedTransformTs` — TypeScript function A→B ready to use
- `requirementsReport` — breaking/non-breaking change classification
- `impactAssessment` — impact score (0–100), impact label, per-diff remediation hints, routing recommendation
- `driftDetected` / `driftDetail` — confidence decay vs. baseline

**Use it for:**
- Detecting when a connector's API changed
- Auto-generating transform code between two systems
- Flagging breaking changes before they reach production
- Routing reports to: `auto_resolved`, `operator_review`, `incident_alert`, `workflow_engine`, `timeline_trace`

**Does NOT know about:** entity identity, business rules, fiscal policy, amounts, customers, invoices.

---

## reconciliation-engine (`packages/reconciliation-engine`)

**What it detects:** Business/entity inconsistency across systems.

**Input:** Two canonical entities of the same type (product, customer, invoice) from two different source systems.

**Output:** `ReconciliationResult` with:
- `match` — identity match decision (match / review / no_match) with confidence
- `conflicts` — typed conflict list with severity
- `recommendation` — PROCEED / ALERT / BLOCK / AUTO_FIX / IGNORE
- `enriched results` (via `enrichWithActionability()`) — `autoFixable`, `suggestedAction`, `routeTo`, operation command hints

**Use it for:**
- Detecting price drift between catalog systems
- Detecting stock divergence between warehouse and ERP
- Detecting fiscal inconsistencies (CAE mismatch, customer tax ID mismatch)
- Deciding whether to block, alert, or auto-fix before syncing

**Does NOT know about:** schema structure, field rename candidates, TypeScript code generation.

---

## How they feed the platform

```
schema-bridge output → impactAssessment.routeTo:
  auto_resolved      → no action (timeline trace only)
  operator_review    → schema review queue
  incident_alert     → alert channel (email/Slack)
  workflow_engine    → trigger workflow step
  operation_engine   → dispatch sync_record / update_record
  timeline_trace     → append to timeline for monitoring

reconciliation-engine output → PolicyEvaluationResult.routeTo:
  auto_fix           → engine applies fix on next sync cycle
  operation_engine   → dispatch sync_record / update_record / approve_document
  operator_review    → conflict review queue
  alert_channel      → BLOCK-level escalation
  timeline_only      → IGNORE conflicts, logged only
  no_action          → PROCEED, all clean
```

Both engines write to `timeline` for observability. Neither engine writes directly to the database — they return results, and callers decide what to do.

---

## Keep them separate

Do NOT merge these engines. They have different semantics:

| | schema-bridge | reconciliation-engine |
|---|---|---|
| Input | Raw data samples or schema objects | Canonical entity pairs |
| Domain knowledge | None — purely structural | Entity-specific (product, customer, invoice) |
| Output granularity | Field-level | Conflict-type-level |
| Auto-transform | Yes (TypeScript code gen) | No |
| Policy rules | No | Yes (BLOCK / ALERT / AUTO_FIX / IGNORE) |
| Country-specific | No | Partial (CAE, CUIT via country-packs) |
