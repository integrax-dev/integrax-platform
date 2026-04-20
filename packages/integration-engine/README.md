# @integrax/integration-engine

Pluggable adapter for external flow/automation engines. Currently backed by Activepieces.

**Exports:** `createEngine(idMapper?)` — factory that reads `INTEGRATION_ENGINE_URL` and `INTEGRATION_ENGINE_API_KEY` from env; `IntegrationEngine` interface, `FlowRun`, `Flow`, `TriggerFlowInput`, `IdMapper`, `IntegrationEngineError`.

**Key interface methods:** `triggerFlow`, `getFlowRun`, `listFlows`, `mapTenantId`.

**To swap the backend:** implement `IntegrationEngine` and update `createEngine`. Routes and modules never import Activepieces directly.

**Consumers:** `services/control-plane` (workflow trigger routes), `packages/integration-orchestrator`.
