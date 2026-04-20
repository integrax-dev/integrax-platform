# routes/

Un archivo por grupo de rutas. Todos los routers se registran en `server.ts`.

| Archivo | Rutas |
|---|---|
| `tenants.ts` | `/api/tenants` — CRUD, suspend, activate |
| `connectors.ts` | `/api/connectors` — config, catálogo, test, learn |
| `platform.ts` | `/api` — orders, inventory, billing, catalog, ecommerce, consistency |
| `operations.ts` | `/api/operations` — OperationEngine: submit, retry, approve |
| `modules.ts` | `/api/tenants/:id/modules` — config per-tenant de módulos |
| `schemas.ts` | `/api/schemas/diff` — diff de schemas vía Temporal |
| `drift.ts` | `/api/drift` — detección y análisis de drift |
| `snapshots.ts` | `/api/snapshots` — snapshots canónicos |
| `timeline.ts` | `/api/timeline` — historial de cambios |
| `workflows.ts` | `/api/workflows` — Temporal workflows |
| `webhooks.ts` | `/api/webhooks` — ingestión de webhooks |
| `reconciliation.ts` | `/api/reconciliation` — reconciliación entre sistemas |
| `auth.ts` | `/api/auth` — login, refresh |
| `admin.ts` | `/api/admin` — gestión platform_admin |
| `credits.ts` | `/api/credits` — créditos por tenant |
| `storage.ts` | `/api/storage` — archivos por tenant |
| `license.ts` | `/api/license` — validación de licencias |
| `telemetry.ts` | `/telemetry/ingest` — recibe datos de telemetry-agent |
| `stream.ts` | `/api/stream` — SSE para eventos en tiempo real |
