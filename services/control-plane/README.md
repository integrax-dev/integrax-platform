# control-plane

API REST principal de IntegraX. Puerto 3000. Entry point: `src/server.ts`.

## Rutas registradas
- `/api/tenants` — CRUD de tenants
- `/api/connectors` — conectores por tenant, test de conexión, catálogo
- `/api/schemas` — diff de schemas con Temporal
- `/api/platform` — módulos de dominio: orders, inventory, billing, catalog, ecommerce, consistency
- `/api/operations` — operaciones vía OperationEngine
- `/api/snapshots`, `/api/timeline` — estado canónico por tenant
- `/api/workflows` — Temporal workflows
- `/api/drift` — análisis de drift con LLM
- `/api/modules` — configuración per-tenant de módulos (ej. Medusa para ecommerce)
- `/api/credits`, `/api/storage`, `/api/auth`, `/api/admin`, `/api/license`, `/telemetry`

## Estructura interna clave
- `src/platform/container/` — singletons de toda la app (stores, event-bus, módulos, engine)
- `src/routes/` — un archivo por grupo de rutas
- `src/store/` — acceso a Postgres (pg-snapshot-store, pg-operation-store, tenants, connectors, etc.)
- `src/middleware/` — auth (JWT + API Key), roles, rate-limit, audit, validate
- `src/connectors/testers/` — test de conexión por conector (un archivo por conector)
- `src/notifications/channels/` — canales de notificación (un archivo por canal)
- `src/ports/` — interfaces de puertos externos (LLM, etc.)

## Variables de entorno requeridas
- `JWT_SECRET` — FATAL si falta
- `DATABASE_URL` — Postgres
- `ANTHROPIC_API_KEY` — opcional, habilita análisis LLM
- `TEMPORAL_ADDRESS` — opcional, habilita workflows durables
