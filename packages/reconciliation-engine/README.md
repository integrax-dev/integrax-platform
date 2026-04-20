# @integrax/reconciliation-engine

Canonical entity reconciliation: identity matching, field-level diff detection, and policy-driven action selection (auto-resolve, flag, escalate).

**Exports:** entity reconcilers (per entity type), `ReconciliationRegistry`, shared: `EntityConflict`, `MatchResult`, `PolicyEvaluationResult`, `ReconciliationResult`, normalization helpers, similarity functions.

**How it works:** loads two snapshots of the same entity from different connectors, runs similarity-scored identity matching, diffs fields, evaluates a conflict policy, and returns a `ReconciliationResult` with a recommended `PolicyAction`.

**Consumers:** `services/control-plane` (reconciliation routes `/api/reconciliation`), `modules/consistency-inspector`.
