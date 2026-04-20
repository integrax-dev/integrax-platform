# @integrax/health

Express router that provides standardized health/readiness/metrics endpoints for all IntegraX services.

**Exports:** `createHealthManager()` → returns a `HealthManager` with `.router` (Express Router).

**Endpoints exposed:**
- `GET /health` — liveness; always 200 while the process is running
- `GET /ready` — readiness; 200 only if all registered dependency checks pass
- `GET /metrics` — Prometheus exposition format (delegates to `@integrax/metrics`)

**Consumers:** `services/control-plane`, `services/realtime`, `workers/ts`.
