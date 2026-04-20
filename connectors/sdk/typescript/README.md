# @integrax/connector-sdk

Base library for building IntegraX connectors. Every connector implementation extends this SDK.

**Exports:**
- `BaseConnector` — abstract class with lifecycle hooks and schema-guard wrapping
- `ConnectorSpec`, `ActionDefinition`, `ResolvedCredentials` — declarative connector manifest types
- `ConnectorError`, `RetryableError`, `NonRetryableError` — error hierarchy (RetryableError → auto-retry, NonRetryableError → DLQ)
- `HttpClient` — fetch wrapper with exponential backoff and correlation-id injection
- `IdempotencyStore` — dedup layer for operations
- `observability` — OpenTelemetry span helpers
- `validateSignature`, `schemaGuard` — webhook signature validation and runtime schema diff triggers
- `ConnectorManifest`, `ConnectorFacade` — stable interfaces consumed by `integration-engine`

**Consumers:** all `connectors/implementations/*`, `services/control-plane` (tester registry), `packages/integration-engine`

**To add a new connector:**
1. Create `connectors/implementations/<name>/`
2. Extend `BaseConnector` or export plain functions conforming to `ConnectorSpec`
3. Export `connectorId` and `testConnection` from a tester file
4. Register the tester in `services/control-plane/src/connectors/testers/index.ts`
