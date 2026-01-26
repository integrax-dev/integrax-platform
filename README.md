# IntegraX OSS

Plataforma de integraciones multi-tenant orientada a eventos para empresas de Argentina y LatAm. Arquitectura moderna con soporte para conectores, workflows durables (Temporal), IA generativa (LLM), observabilidad completa y panel de administración.

## Stack Tecnológico

| Categoría | Tecnología |
|-----------|------------|
| Runtime | Node.js 18+, TypeScript 5.3 |
| Workflows | Temporal.io |
| Eventos | Apache Kafka + Debezium (CDC) |
| Cache/PubSub | Redis |
| Base de datos | PostgreSQL |
| Secretos | HashiCorp Vault |
| Observabilidad | Prometheus + Grafana + Alertmanager |
| Frontend | React 18 + Vite + Zustand |
| Monorepo | pnpm workspaces |

---

## Arquitectura Global

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              ADMIN PANEL (React)                            │
│                        Dashboard · Tenants · Workflows                      │
└─────────────────────────────────┬───────────────────────────────────────────┘
                                  │
┌─────────────────────────────────▼───────────────────────────────────────────┐
│                           CONTROL PLANE API                                 │
│              REST API · JWT Auth · RBAC · Rate Limiting                     │
└───────┬─────────────┬─────────────┬─────────────┬─────────────┬─────────────┘
        │             │             │             │             │
        ▼             ▼             ▼             ▼             ▼
┌───────────┐  ┌───────────┐  ┌───────────┐  ┌───────────┐  ┌───────────┐
│  Tenant   │  │   LLM     │  │ Connector │  │  Realtime │  │  Metrics  │
│  Service  │  │Orchestratr│  │ Learning  │  │ WebSocket │  │  Service  │
└─────┬─────┘  └─────┬─────┘  └─────┬─────┘  └─────┬─────┘  └─────┬─────┘
      │              │              │              │              │
      └──────────────┼──────────────┼──────────────┼──────────────┘
                     │              │              │
┌────────────────────▼──────────────▼──────────────▼──────────────────────────┐
│                         TEMPORAL WORKFLOWS                                   │
│           OrderWorkflow · PaymentWorkflow · MultiTenantWorkflow             │
│                     Activities · Signals · Queries                          │
└─────────────────────────────────┬───────────────────────────────────────────┘
                                  │
┌─────────────────────────────────▼───────────────────────────────────────────┐
│                            CONECTORES                                        │
│     AFIP · MercadoPago · WhatsApp · Email · Google Sheets · Contabilium     │
└─────────────────────────────────────────────────────────────────────────────┘
                                  │
┌──────────────┬──────────────────┼──────────────────┬────────────────────────┐
│              │                  │                  │                        │
▼              ▼                  ▼                  ▼                        ▼
┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐
│PostgreSQL│  │  Redis   │  │  Kafka   │  │  Vault   │  │Prometheus│
└──────────┘  └──────────┘  └──────────┘  └──────────┘  └──────────┘
```

---

## Estructura del Monorepo

```
integrax/
├── apps/
│   └── admin-panel/                    # Panel de administración React
│       ├── src/
│       │   ├── components/             # Componentes reutilizables
│       │   ├── pages/                  # Páginas (Dashboard, Tenants, etc.)
│       │   ├── stores/                 # Estado global (Zustand)
│       │   └── services/               # Llamadas API
│       └── package.json
│
├── connectors/
│   ├── sdk/typescript/                 # SDK base para crear conectores
│   │   ├── src/
│   │   │   ├── types.ts               # Tipos: ConnectorConfig, ConnectorResult
│   │   │   ├── errors.ts              # Errores tipados: RetryableError, etc.
│   │   │   ├── idempotency.ts         # IdempotencyManager
│   │   │   └── observability.ts       # Métricas y tracing
│   │   └── package.json
│   │
│   ├── implementations/                # Conectores implementados
│   │   ├── afip-wsfe/                 # Factura electrónica AFIP Argentina
│   │   ├── mercadopago/               # Pagos con MercadoPago
│   │   ├── whatsapp/                  # WhatsApp Business API
│   │   ├── email/                     # Envío SMTP
│   │   ├── google-sheets/             # Google Sheets API
│   │   └── contabilium/               # ERP Contabilium
│   │
│   └── shared/                         # Utilidades compartidas
│       ├── retry.ts                   # Estrategias de retry
│       └── validation.ts              # Validación de schemas
│
├── contracts/
│   ├── openapi/                        # Especificaciones REST API
│   │   └── control-plane.yaml
│   ├── asyncapi/                       # Especificaciones de eventos
│   │   └── events.yaml
│   ├── schemas/                        # JSON Schemas
│   │   ├── tenant.schema.json
│   │   ├── workflow.schema.json
│   │   └── connector.schema.json
│   └── samples/                        # Ejemplos de payloads
│
├── services/
│   ├── control-plane/                  # API principal de administración
│   ├── llm-orchestrator/               # Orquestador con IA (Anthropic)
│   ├── connector-learning/             # Motor de aprendizaje de APIs
│   ├── kafka-consumer/                 # Consumidor CDC (Debezium)
│   ├── tenant/                         # Servicio multi-tenant
│   ├── metrics/                        # Exportador Prometheus
│   ├── secrets/                        # Integración HashiCorp Vault
│   └── realtime/                       # WebSocket server
│
├── workflows/
│   └── temporal/
│       ├── src/
│       │   ├── workflows/             # Definición de workflows
│       │   ├── activities/            # Activities (conectores, transformaciones)
│       │   └── client/                # Cliente Temporal
│       └── package.json
│
├── workers/
│   ├── ts/                             # Worker TypeScript
│   └── go/                             # Worker Go (alta performance)
│
└── infra/
    ├── docker-compose/
    │   ├── mvp/                       # Stack mínimo (Temporal, Kafka, Redis, PG)
    │   └── enterprise/                # Stack completo (+Vault, Prometheus, Grafana)
    └── observability/
        ├── prometheus/                # Configuración y alertas
        └── grafana/                   # Dashboards
```

---

## Servicios

### Control Plane API

**Puerto:** 3000

API REST principal para administración de la plataforma.

```typescript
// Endpoints principales
POST   /api/auth/login              // Login, retorna JWT
POST   /api/auth/register           // Registro de usuario
GET    /api/tenants                 // Listar tenants
POST   /api/tenants                 // Crear tenant
GET    /api/tenants/:id             // Obtener tenant
PATCH  /api/tenants/:id             // Actualizar tenant
DELETE /api/tenants/:id             // Eliminar tenant
POST   /api/tenants/:id/suspend     // Suspender tenant
POST   /api/tenants/:id/activate    // Activar tenant

// Workflows Temporal
POST   /api/workflows/temporal/payment   // Iniciar workflow de pago
POST   /api/workflows/temporal/order     // Iniciar workflow de orden
GET    /api/workflows/temporal/:id       // Estado del workflow
GET    /api/workflows/temporal           // Listar workflows
POST   /api/workflows/temporal/:id/cancel // Cancelar workflow
POST   /api/workflows/temporal/:id/signal // Enviar signal

// Conectores
GET    /api/connectors                   // Listar conectores disponibles
POST   /api/connectors/:id/test          // Test de conexión
```

**Autenticación:** JWT con roles (admin, operator, viewer)

---

### LLM Orchestrator

**Puerto:** 3001

Orquestador inteligente que usa Claude (Anthropic) para:
- Interpretar intenciones del usuario en lenguaje natural
- Seleccionar conectores apropiados
- Generar configuraciones de workflow
- Mapear datos entre sistemas

```typescript
// Herramientas disponibles para el LLM
const tools = [
  'list_connectors',      // Listar conectores del tenant
  'get_connector_schema', // Obtener schema de un conector
  'execute_connector',    // Ejecutar conector (modo seguro)
  'start_workflow',       // Iniciar workflow
  'get_workflow_status',  // Consultar estado
  'transform_data',       // Transformar datos
];
```

**Registro de conectores multi-tenant:**
```typescript
const registry = new ConnectorRegistry();
registry.register('tenant-1', 'mercadopago', mercadoPagoConfig);
registry.register('tenant-1', 'afip', afipConfig);
```

---

### Connector Learning Engine

**Puerto:** 3002

Motor de aprendizaje automático de APIs externas.

```typescript
// Análisis de API
const learningEngine = new ConnectorLearningEngine({
  anthropicApiKey: process.env.ANTHROPIC_API_KEY
});

const connector = await learningEngine.learnFromOpenAPI(
  'https://api.example.com/openapi.json'
);

// Genera automáticamente:
// - Tipos TypeScript
// - Funciones de llamada
// - Validaciones
// - Manejo de errores
```

---

### Tenant Service

**Puerto:** 3004

Gestión completa de multi-tenancy:

```typescript
interface Tenant {
  id: string;
  name: string;
  status: 'active' | 'suspended' | 'pending';
  plan: 'free' | 'pro' | 'enterprise';
  limits: {
    maxWorkflowsPerMonth: number;
    maxConnectors: number;
    maxEventsPerDay: number;
  };
  settings: {
    webhookUrl?: string;
    notificationEmail?: string;
    timezone: string;
  };
}
```

---

### Metrics Service

**Puerto:** 9090

Exportador de métricas Prometheus.

```typescript
// Métricas disponibles
integrax_http_requests_total{method, path, status, tenant_id}
integrax_http_request_duration_seconds{method, path, tenant_id}
integrax_workflows_started_total{workflow_type, tenant_id}
integrax_workflows_completed_total{workflow_type, status, tenant_id}
integrax_connector_calls_total{connector, operation, status, tenant_id}
integrax_connector_call_duration_seconds{connector, operation, tenant_id}
integrax_active_connections{service}
integrax_tenant_usage{tenant_id, resource}
integrax_dlq_messages_total{tenant_id, reason}
```

---

### Secrets Service (Vault)

Integración con HashiCorp Vault para gestión segura de secretos.

```typescript
const secretsManager = new SecretsManager({
  vaultAddr: 'http://vault:8200',
  vaultToken: process.env.VAULT_TOKEN
});

// Almacenar credenciales de conector
await secretsManager.storeConnectorCredentials('tenant-1', 'mercadopago', {
  accessToken: 'xxx',
  publicKey: 'yyy'
});

// Obtener credenciales
const creds = await secretsManager.getConnectorCredentials('tenant-1', 'mercadopago');

// Encriptación por tenant
const encrypted = await secretsManager.encrypt('tenant-1', 'sensitive-data');
const decrypted = await secretsManager.decrypt('tenant-1', encrypted);
```

---

### Realtime WebSocket Server

**Puerto:** 3003

Servidor WebSocket para notificaciones en tiempo real.

```typescript
// Conexión
const ws = new WebSocket('ws://localhost:3003?token=JWT_TOKEN');

// Suscribirse a canales
ws.send(JSON.stringify({ type: 'subscribe', channel: 'workflows' }));
ws.send(JSON.stringify({ type: 'subscribe', channel: 'alerts' }));

// Canales disponibles:
// - workflows    → Eventos de ejecución de workflows
// - events       → Notificaciones de procesamiento de eventos
// - connectors   → Estado de llamadas a conectores
// - alerts       → Alertas y warnings del sistema
// - system       → Estado de conexión
```

**Características:**
- Autenticación JWT
- Aislamiento por tenant
- Escalado horizontal con Redis pub/sub

---

## Admin Panel

**Puerto:** 5173 (dev)

Panel de administración construido con React + Vite + Zustand.

### Páginas

| Página | Descripción |
|--------|-------------|
| Dashboard | Métricas generales, workflows activos, conectores |
| Tenants | CRUD de tenants, planes, límites |
| Workflows | Lista de workflows, estados, logs |
| Connectors | Catálogo de conectores, configuración |
| Events | Visor de eventos, filtros por tenant |
| Settings | Configuración de API keys, notificaciones |

### Ejecución

```bash
cd apps/admin-panel
pnpm install
pnpm dev
```

---

## Conectores

### Disponibles

| Conector | Descripción | País |
|----------|-------------|------|
| `afip-wsfe` | Factura electrónica AFIP | Argentina |
| `mercadopago` | Pagos y cobros | LatAm |
| `whatsapp` | WhatsApp Business API | Global |
| `email` | Envío SMTP | Global |
| `google-sheets` | Lectura/escritura de hojas | Global |
| `contabilium` | ERP Contabilium | Argentina |

### Crear un conector nuevo

```typescript
import {
  ConnectorConfig,
  ConnectorResult,
  RetryableError
} from '@integrax/connector-sdk';

export const myConnectorConfig: ConnectorConfig = {
  id: 'my-connector',
  name: 'Mi Conector',
  version: '1.0.0',
  auth: {
    type: 'api_key',
    fields: ['apiKey']
  },
  actions: {
    getData: {
      description: 'Obtiene datos',
      input: { type: 'object', properties: { id: { type: 'string' } } },
      output: { type: 'object' }
    }
  }
};

export async function getData(
  credentials: { apiKey: string },
  input: { id: string }
): Promise<ConnectorResult> {
  try {
    const response = await fetch(`https://api.example.com/${input.id}`, {
      headers: { 'Authorization': `Bearer ${credentials.apiKey}` }
    });

    if (!response.ok) {
      if (response.status >= 500) {
        throw new RetryableError('Server error', { maxRetries: 3 });
      }
      throw new Error(`API error: ${response.status}`);
    }

    return { success: true, data: await response.json() };
  } catch (error) {
    return { success: false, error: error.message };
  }
}
```

---

## Workflows (Temporal)

### Workflows disponibles

#### OrderWorkflow

Procesa una orden completa: validación → pago → facturación → notificación.

```typescript
const result = await temporalClient.startOrder('tenant-1', {
  orderId: 'order-123',
  customerId: 'cust-456',
  items: [{ sku: 'PROD-1', qty: 2, price: 100 }],
  paymentMethod: 'mercadopago'
});
```

#### PaymentWorkflow

Maneja el ciclo de vida de un pago con reintentos y compensaciones.

```typescript
const result = await temporalClient.startPayment('tenant-1', {
  amount: 1500.00,
  currency: 'ARS',
  paymentMethod: 'card',
  customerId: 'cust-123'
});
```

#### MultiTenantWorkflow

Workflow genérico que ejecuta conectores con aislamiento de tenant.

```typescript
const result = await temporalClient.startWorkflow(
  'tenant-1',
  'multi-tenant',
  {
    connector: 'mercadopago',
    action: 'createPayment',
    input: { amount: 1000 }
  }
);
```

### Activities

```typescript
// Ejecutar conector
executeConnector({ tenantId, connectorId, action, input })

// Transformar datos
transformData({ tenantId, data, transformations })

// Llamar webhook
callWebhook({ tenantId, url, method, payload })

// Validar límites del tenant
validateTenantLimits(tenantId)

// Registrar métricas
recordMetrics({ tenantId, operation, duration, success })

// Enviar notificación
sendTenantNotification({ tenantId, type, payload })
```

---

## Quickstart

### Requisitos

- Node.js >= 18
- pnpm >= 8
- Docker Desktop

### Instalación

```bash
# Clonar repositorio
git clone https://github.com/your-org/integrax.git
cd integrax

# Instalar dependencias
pnpm install

# Copiar variables de entorno
cp .env.example .env
# Editar .env con tus credenciales
```

### Levantar servicios

```bash
# Stack MVP (mínimo)
pnpm docker:mvp

# O Stack Enterprise (completo con Vault, Prometheus, Grafana)
pnpm docker:enterprise

# Levantar servicios de desarrollo
pnpm dev:control-plane   # API en puerto 3000
pnpm dev:worker          # Worker Temporal
pnpm dev:admin           # Admin Panel en puerto 5173
```

---

## Docker Stacks

### MVP Stack

```bash
pnpm docker:mvp
```

| Servicio | Puerto |
|----------|--------|
| Temporal | 7233 |
| Temporal UI | 8080 |
| PostgreSQL | 5432 |
| Redis | 6379 |
| Kafka | 9092 |
| Zookeeper | 2181 |

### Enterprise Stack

```bash
pnpm docker:enterprise
```

Incluye MVP + :

| Servicio | Puerto |
|----------|--------|
| Vault | 8200 |
| Prometheus | 9090 |
| Grafana | 3100 |
| Alertmanager | 9093 |
| Debezium | 8083 |

---

## Tests

```bash
# Todos los tests
pnpm test

# Tests por paquete
pnpm --filter @integrax/connector-sdk test
pnpm --filter @integrax/temporal-workflows test
pnpm --filter @integrax/llm-orchestrator test

# Tests de integración
pnpm test:integration

# Tests con servicios reales
pnpm test:real
```

**Cobertura actual:** 145 tests passing
- Connector SDK: 63 tests
- LLM Orchestrator: 54 tests
- Temporal Workflows: 28 tests

---

## Observabilidad

### Prometheus

Métricas disponibles en `/metrics` de cada servicio.

**Alertas configuradas:**
- `IntegraXHighErrorRate` - Error rate > 5%
- `IntegraXHighLatency` - Latencia p99 > 5s
- `IntegraXWorkflowFailures` - Workflows fallidos
- `IntegraXDLQGrowing` - DLQ acumulando mensajes
- `IntegraXTenantOverLimit` - Tenant excediendo límites

### Grafana

Dashboard pre-configurado: `IntegraX Platform Overview`

Panels:
- Request rate por servicio
- Latencia p50/p95/p99
- Workflows activos por tipo
- Conectores: calls/s y error rate
- Uso por tenant

**Acceso:** http://localhost:3100 (admin/admin)

---

## Comandos útiles

```bash
# Desarrollo
pnpm install          # Instalar dependencias
pnpm build            # Build de todos los paquetes
pnpm dev              # Dev mode (todos los servicios)
pnpm lint             # Linter
pnpm typecheck        # Verificar tipos

# Docker
pnpm docker:mvp           # Levantar stack MVP
pnpm docker:mvp:down      # Bajar stack MVP
pnpm docker:mvp:logs      # Ver logs
pnpm docker:enterprise    # Levantar stack Enterprise
pnpm docker:enterprise:down
pnpm setup:debezium       # Configurar Debezium

# Tests
pnpm test                 # Todos los tests
pnpm test:integration     # Tests de integración
pnpm test:real           # Tests con APIs reales

# Simulación
pnpm simulate:payment     # Simular un pago
pnpm stress-test          # Stress test
```

---

## Principios de diseño

- **Event-driven por defecto** - Kafka como bus de eventos principal
- **Idempotencia en bordes** - Cada conector maneja idempotencia
- **Observabilidad end-to-end** - Logs, métricas y tracing por tenant
- **LLM controlado** - IA sin acceso directo a acciones críticas
- **Multi-tenant first** - Aislamiento completo entre tenants
- **Fail-safe** - Reintentos, DLQ, compensaciones automáticas

---

## Contribuir

1. Fork del repositorio
2. Crear branch: `git checkout -b feature/mi-feature`
3. Commit: `git commit -m 'Add: mi feature'`
4. Push: `git push origin feature/mi-feature`
5. Crear Pull Request

---

## Licencia

Apache-2.0
