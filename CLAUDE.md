# IntegraX Platform

Plataforma de integración multi-tenant orientada a eventos para empresas de Argentina y LatAm.
**Monorepo** gestionado con pnpm workspaces. Node.js 18+, TypeScript 5.3, Apache-2.0.

---

## Comandos raíz

```bash
pnpm install                  # Instalar todas las dependencias
pnpm build                    # Build de todos los paquetes
pnpm test                     # Tests de todos los paquetes
pnpm lint                     # ESLint en todos los paquetes

# Servicios dev (cada uno en su terminal)
pnpm dev:worker               # Worker BullMQ (workers/ts)
pnpm dev:temporal             # Temporal worker (workflows/temporal)
pnpm dev:kafka-consumer       # Kafka consumer (services/kafka-consumer)

# Docker
pnpm docker:mvp               # Stack MVP: Postgres, Redis, n8n, Worker, OTEL, Prometheus, Loki, Grafana
pnpm docker:mvp:down
pnpm docker:mvp:logs
pnpm docker:enterprise        # Stack enterprise (+Vault, Debezium, Alertmanager)
pnpm docker:enterprise:down

# Scripts de utilidad
pnpm test:integration         # Tests de integración (tsx scripts/test-integration.ts)
pnpm test:real                # Tests con APIs reales
pnpm simulate:payment         # Simula un pago
pnpm stress-test              # Stress test
pnpm setup:debezium           # Configura Debezium CDC
```

---

## Estructura del monorepo

```
apps/
  admin-panel/                # Panel React (Zustand, Vite) — puerto 5173
connectors/
  sdk/typescript/             # @integrax/connector-sdk — base para todos los conectores
  implementations/
    afip-wsfe/                # @integrax/connector-afip-wsfe
    mercadopago/              # @integrax/connector-mercadopago
    contabilium/              # @integrax/connector-contabilium
    google-sheets/            # @integrax/connector-google-sheets
    whatsapp/                 # (WhatsApp Business API)
    email/                    # (SMTP)
contracts/
  openapi/control-plane.yaml  # Spec REST
  asyncapi/events.yaml        # Spec de eventos
  schemas/                    # JSON Schemas de tenant, workflow, connector
packages/
  health/                     # @integrax/health — health/readiness checks
  logger/                     # @integrax/logger — structured logging (pino)
  metrics/                    # @integrax/metrics — middleware Prometheus
services/
  control-plane/              # @integrax/control-plane — API REST principal, puerto 3000
  llm-orchestrator/           # @integrax/llm-orchestrator — orquestador IA (Claude/Anthropic), puerto 3001
  connector-learning/         # Motor de aprendizaje de APIs con LLM, puerto 3002
  realtime/                   # WebSocket server (JWT + Redis pub/sub), puerto 3003
  tenant/                     # Servicio multi-tenant, puerto 3004
  kafka-consumer/             # Consumidor Kafka/Debezium → Temporal
  metrics/                    # Exportador Prometheus
  secrets/                    # Integración HashiCorp Vault
workers/
  ts/                         # @integrax/worker — BullMQ worker (procesa jobs de Redis queue)
workflows/
  temporal/                   # @integrax/temporal-workflows — workflows durables
infra/
  docker-compose/
    mvp/docker-compose.yml    # Stack MVP
    enterprise/               # Stack completo
  observability/              # Configs de Prometheus, Grafana, Loki, OTEL
```

---

## Servicios: resumen técnico

### `services/control-plane` — Puerto 3000

API REST principal. Entry point: `src/server.ts`. Dev: `tsx watch src/server.ts`.

**Rutas:**
```
GET/POST  /api/tenants           Gestión de tenants
GET/PATCH/DELETE /api/tenants/:id
POST      /api/tenants/:id/suspend | activate

GET/POST  /api/connectors        Conectores del tenant
GET       /api/connectors/catalog
GET       /api/connectors/catalog/:id
POST      /api/connectors/:id/test
DELETE    /api/connectors/:id
POST      /api/connectors/learn  (platform_admin only, LLM-powered)

GET/POST  /api/workflows
GET/POST  /api/workflows/temporal/payment | order
GET       /api/workflows/temporal/:id
POST      /api/workflows/temporal/:id/cancel | signal
GET       /api/audit
GET       /api/metrics
GET       /health   /ready   /metrics (Prometheus)
```

**Variables requeridas:**
```
JWT_SECRET                        # FATAL si falta
CREDENTIAL_ENCRYPTION_KEY         # AES-256; si falta, genera una random (no persistente)
PORT                              # default 3000
NODE_ENV
```

**Auth:** JWT (`Bearer <token>`) o API Key (`ApiKey ixk_...` + header `X-Tenant-Id`).
**Roles:** `platform_admin > tenant_admin > operator > viewer`.
**Middleware:** `requireAuth` → `requireRole(...)` → `requireTenant` → `validate(ZodSchema)` → `audit('action')`.

**Estado actual:** los stores de tenants y conectores son **in-memory** (`Map`). Se pierden al reiniciar. Pendiente migrar a Postgres.

**Credenciales de conectores:** cifradas con AES-256-CBC antes de guardar, descifradas solo al hacer test.

---

### `workers/ts` — @integrax/worker

Worker BullMQ que procesa jobs de Redis. Entry: `src/index.ts`.

**Handlers registrados (`src/worker.ts`):**
- `business.order.paid` → `handlers/order-paid.ts`
- `business.invoice.issued` → `handlers/invoice-issued.ts`

**Variables requeridas:**
```
REDIS_HOST / REDIS_PORT / REDIS_PASSWORD
POSTGRES_HOST / POSTGRES_PORT / POSTGRES_USER / POSTGRES_PASSWORD / POSTGRES_DB
WORKER_CONCURRENCY   # default 5
WORKER_QUEUE_NAME
LOG_LEVEL
OTEL_EXPORTER_OTLP_ENDPOINT   # opcional, para tracing
```

---

### `services/kafka-consumer`

Consume Kafka topics (Debezium CDC + eventos de negocio) y dispara workflows en Temporal.

**Topics escuchados:**
```
integrax.public.payments   integrax.public.orders
integrax.public.invoices   integrax.public.outbox
integrax.payments          integrax.orders
integrax.webhooks
```

**Variables requeridas:**
```
KAFKA_BROKERS        # coma-separado, FATAL si vacío
KAFKA_GROUP_ID       # default: integrax-consumer
TEMPORAL_ADDRESS     # FATAL si falta
TEMPORAL_TASK_QUEUE  # default: integrax-workflows
```

---

### `services/realtime` — Puerto 3003

WebSocket server con auth JWT y aislamiento por tenant (Redis pub/sub para escalar horizontal).

**Conexión:** `ws://localhost:3003?token=JWT_TOKEN`
**Canales:** `workflows`, `events`, `connectors`, `alerts`, `system`

**Variables requeridas:**
```
JWT_SECRET   # FATAL si falta
REDIS_URL    # FATAL si falta
WS_PORT      # default 3003
```

---

### `services/llm-orchestrator` — @integrax/llm-orchestrator

Orquestador IA usando Claude (Anthropic SDK). Interpreta intenciones en lenguaje natural, selecciona conectores, genera workflows.

**Tools disponibles para el LLM:**
`list_connectors`, `get_connector_schema`, `execute_connector`, `start_workflow`, `get_workflow_status`, `transform_data`

**Variables requeridas:**
```
ANTHROPIC_API_KEY
```

---

### `workflows/temporal` — @integrax/temporal-workflows

Workflows durables con Temporal.io.

**Workflows:**
- `OrderWorkflow` — validación → pago → factura → notificación
- `PaymentWorkflow` — ciclo de vida de pago con reintentos y compensaciones
- `MultiTenantWorkflow` — ejecuta cualquier conector con aislamiento de tenant

**Activities principales:**
`executeConnector`, `transformData`, `callWebhook`, `validateTenantLimits`, `recordMetrics`, `sendTenantNotification`

---

## Connector SDK (`connectors/sdk/typescript`)

Módulos: `types`, `errors`, `http`, `idempotency`, `observability`, `connector`, `decorators`, `auth`.

**Errores clave:**
- `RetryableError` — el worker hace retry automático
- `NonRetryableError` — va directo a DLQ

**Patrón de conector nuevo:**
```typescript
import { ConnectorConfig, ConnectorResult, RetryableError } from '@integrax/connector-sdk';

export const config: ConnectorConfig = {
  id: 'my-connector',
  name: 'Mi Conector',
  version: '1.0.0',
  auth: { type: 'api_key', fields: ['apiKey'] },
  actions: {
    getData: {
      description: 'Obtiene datos',
      input:  { type: 'object', properties: { id: { type: 'string' } } },
      output: { type: 'object' },
    },
  },
};

export async function getData(
  credentials: { apiKey: string },
  input: { id: string }
): Promise<ConnectorResult> {
  const response = await fetch(`https://api.example.com/${input.id}`, {
    headers: { Authorization: `Bearer ${credentials.apiKey}` },
  });
  if (!response.ok) {
    if (response.status >= 500) throw new RetryableError('Server error', { maxRetries: 3 });
    throw new Error(`API error: ${response.status}`);
  }
  return { success: true, data: await response.json() };
}
```

---

## Infraestructura (MVP docker-compose)

| Servicio | Puerto | Notas |
|---|---|---|
| PostgreSQL 16 | 5432 | user/pass/db: `integrax` |
| Redis 7 | 6379 | appendonly yes |
| n8n | 5678 | workflow automation; BD: postgres/n8n |
| Worker | — | build desde `workers/ts/Dockerfile` |
| OTEL Collector | 4317/4318/8888/8889 | |
| Prometheus | 9090 | |
| Loki | 3100 | |
| Grafana | 3000 | admin/admin |

Enterprise agrega: Vault (8200), Debezium (8083), Alertmanager (9093), Temporal (7233/8080), Kafka (9092).

---

## Tipos clave (`services/control-plane/src/types.ts`)

- `TenantPlan`: `'free' | 'starter' | 'professional' | 'enterprise'`
- `TenantStatus`: `'active' | 'suspended' | 'pending' | 'cancelled'`
- `UserRole`: `'platform_admin' | 'tenant_admin' | 'operator' | 'viewer'`
- `WorkflowTrigger.type`: `'webhook' | 'schedule' | 'event' | 'manual'`
- `RunStatus`: `'pending' | 'running' | 'success' | 'failed' | 'cancelled'`
- `EventStatus`: `'pending' | 'processing' | 'processed' | 'failed' | 'dlq'`

Todos validados con **Zod**. Los schemas de Zod están junto a los tipos.

---

## Testing

```bash
pnpm test                                    # Todos
pnpm --filter @integrax/connector-sdk test   # SDK (63 tests)
pnpm --filter @integrax/llm-orchestrator test # LLM (54 tests)
pnpm --filter @integrax/temporal-workflows test # Temporal (28 tests)
```

Test runner: **Vitest** en todos los paquetes.

---

## Principios de diseño

- **Event-driven** — Kafka como bus principal, Debezium para CDC
- **Idempotencia en bordes** — cada conector maneja su propia idempotencia
- **Multi-tenant first** — aislamiento completo; tenantId siempre requerido en el contexto
- **LLM controlado** — la IA no tiene acceso directo a acciones críticas, solo a tools definidas
- **Fail-safe** — reintentos configurables, DLQ, compensaciones en Temporal
- **Observabilidad end-to-end** — cada request/job lleva `correlationId` + `tenantId` en los logs
