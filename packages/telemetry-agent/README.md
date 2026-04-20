# @integrax/telemetry-agent

Lightweight agent that ships aggregated logs and metrics from self-hosted IntegraX instances to integrax.dev for monitoring and support.

**Exports:** `TelemetryAgent`, `AgentConfig`.

**How it works:** batches log lines and metric snapshots, compresses, and POSTs to the telemetry endpoint at a configurable interval. Uses `instanceId` for tenant isolation.

**Consumers:** `services/control-plane` (telemetry routes `/api/telemetry`), optionally run as a standalone sidecar via `cli.ts`.
