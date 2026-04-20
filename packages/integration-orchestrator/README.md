# @integrax/integration-orchestrator

Closes the runtime integration loop: webhook or poll input → canonicalize → snapshot store upsert → event-bus publish (only on change) → timeline write.

**Exports:** `IntegrationOrchestrator`, `ConnectorManifestRegistry`, `Canonicalizer`, `SnapshotWriter`, `EventPublisher`, `TimelineWriter`, `registerTenantPolling`, types: `OrchestratorConfig`, `OrchestratorResult`, `ConnectorRegistration`.

**How it works:** instantiated once in the control-plane container. Webhook ingestion middleware and polling scheduler callbacks both call `orchestrator.process(connectorId, tenantId, rawPayload)`.

**Consumers:** `services/control-plane` (container, webhook routes, polling setup).
