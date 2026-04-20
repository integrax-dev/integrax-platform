# @integrax/polling-scheduler

Cursor-based incremental fetch scheduler. Tracks the last-fetched position per connector/tenant and only fetches records created/updated after that cursor.

**Exports:** `PollingScheduler`, `InMemoryCursorStore`, types: `PollingConfig`, `PollingCursor`, `PollingResult`.

**How it works:** `PollingScheduler.register(config)` starts a `setInterval` that calls the connector's fetch function, processes new records, and advances the cursor on success.

**Consumers:** `packages/integration-orchestrator` (`registerTenantPolling`), `services/control-plane` container.
