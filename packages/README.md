# packages/

Shared libraries imported by services, modules, and workers. None are runnable — they are build targets that publish to the monorepo workspace.

| Package | Description |
|---------|-------------|
| `adapters` | Provider-agnostic adapters for LLM (Claude), queue (BullMQ), and email (Resend/SMTP) |
| `entities` | Canonical entity type definitions shared across the whole platform |
| `event-bus` | Typed in-process event bus (InMemoryEventBus) |
| `health` | Express `/health`, `/ready`, `/metrics` router used by all services |
| `integration-engine` | Adapter over Activepieces (or any flow engine) for triggering flows |
| `integration-orchestrator` | Webhook/poll → canonicalize → snapshot → event-bus → timeline pipeline |
| `logger` | Structured logging (pino) with tenantId/correlationId child loggers |
| `operation-engine` | Generic command/operation engine with approval, retry, audit, and hooks |
| `platform-kernel` | Schema-agnostic diff engine and cross-connector identity resolver |
| `polling-scheduler` | Cursor-based incremental fetch scheduler |
| `reconciliation-engine` | Entity reconciliation: identity matching, diff, and policy actions |
| `schema-bridge` | Schema comparison engine — detects structural drift between two connector schemas |
| `snapshot-store` | Last-known canonical state store for cross-system entity snapshots |
| `storage` | File storage adapter (Cloudflare R2 or local filesystem) |
| `telemetry-agent` | Lightweight agent that ships logs/metrics to integrax.dev |
| `timeline` | Append-only event log for entity changes, sync runs, and workflow executions |
| `webhook-ingestion` | Webhook signature validation, normalization, and event-bus enqueue |
