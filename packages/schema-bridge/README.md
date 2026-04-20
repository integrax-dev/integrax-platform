# @integrax/schema-bridge

Schema comparison engine. Detects structural and type-level drift between two connector schemas and generates TypeScript transformation code.

**Exports:** `SchemaBridge`, `createSchemaBridge(config)`, `assessImpact`, `defaultBusinessTypeProviders`, `detectBusinessFormat`.

**How it works:** infers schemas from data samples, diffs them, scores the impact, resolves conflicts deterministically (no LLM tokens for clear-cut cases), escalates to LLM only for ambiguous mappings, and emits a `SchemaDriftTrace` to the timeline.

**Key config:** `redisUrl` for caching mapping memory; without Redis it uses an in-process LRU cache.

**Consumers:** `services/control-plane` (drift routes, schema routes), `services/connector-watchdog`, `workflows/temporal` (`schemaDiffWorkflow`).
