# @integrax/platform-kernel

Two primitive engines used across the platform:

1. **Diff engine** — schema-agnostic comparison of canonical entities. Exports: `compareEntities`, `detectMismatch`, `detectDrift`, `detectDuplicates`, types: `GenericConflict`, `ComparisonResult`, `DuplicateGroup`.

2. **Identity resolver** — cross-connector entity identity resolution using external IDs and aliases. Exports: `IdentityResolver`, types: `IdentityStrategy`, `IdentityCandidate`, `ResolvedIdentity`.

**Consumers:** `packages/reconciliation-engine`, `packages/integration-orchestrator`, `packages/schema-bridge`, `services/control-plane`.
