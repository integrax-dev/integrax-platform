# Service Response Matrix (integrax-platform)

Estado al: 2026-03-02

## Regla general
- `dev` y `staging`: se permiten respuestas mock/demo solo donde está explícitamente programado.
- `prod`: no se permite fallback demo para auth/admin-panel; se debe usar backend real y credenciales reales.

## Admin Panel (apps/admin-panel)
- `POST /api/admin/login` ([apps/admin-panel/src/stores/auth.ts](apps/admin-panel/src/stores/auth.ts))
  - `dev/staging`: si backend falla, devuelve usuario/token demo.
  - `prod`: si backend falla, error explícito (`Servicio de autenticación no disponible`).
- `GET /api/admin/dashboard` ([apps/admin-panel/src/pages/Dashboard.tsx](apps/admin-panel/src/pages/Dashboard.tsx))
  - `dev/staging`: fallback a `MOCK_DASHBOARD_DATA`.
  - `prod`: error explícito (`No se pudo cargar el dashboard`).
- `GET /api/admin/tenants` ([apps/admin-panel/src/pages/Tenants.tsx](apps/admin-panel/src/pages/Tenants.tsx))
  - `dev/staging`: fallback a `MOCK_TENANTS`.
  - `prod`: error explícito.
- `GET /api/admin/events` ([apps/admin-panel/src/pages/Events.tsx](apps/admin-panel/src/pages/Events.tsx))
  - `dev/staging`: fallback a `MOCK_EVENTS`.
  - `prod`: error explícito.

## Conectores y actividades (workflows/temporal)
Estas llamadas son reales contra APIs externas cuando hay credenciales:
- MercadoPago:
  - checkout preferences ([workflows/temporal/src/activities/order-activities.ts](workflows/temporal/src/activities/order-activities.ts))
  - payment status ([workflows/temporal/src/activities/payment-activities.ts](workflows/temporal/src/activities/payment-activities.ts))
- Google Sheets append ([workflows/temporal/src/activities/payment-activities.ts](workflows/temporal/src/activities/payment-activities.ts))

Comportamiento sin credenciales:
- MercadoPago: error explícito (`MERCADOPAGO_ACCESS_TOKEN not configured`).
- Google Sheets: se omite sincronización con log informativo.

## Contratos de servicios (fuente de validación)
Definidos en [contracts/ts/src/connector-contracts.ts](contracts/ts/src/connector-contracts.ts):
- mercadopago
- mercadolibre
- afip-wsfe
- google-sheets
- whatsapp-business
- contabilium
- shopify
- tiendanube

Estos contratos no inventan respuestas: validan esquema/estado contra respuestas HTTP reales cuando se ejecuta el tester con conectividad y credenciales.

## Cómo verificar si una respuesta es real (ahora)
1. Ejecutar verificación live (HTTP real):
  - `npm run verify:services:live`
2. Ejecutar verificación de superficie multiprotocolo:
  - `npm run verify:surface`
  - Incluye HTTP contract por defecto + probes extras (`graphql`, `grpc`, `sql`, `kafka`, `cdc`, `webhook`, `redis`) vía `INTEGRATION_PROBES_JSON`.
  - Además autodetecta infraestructura cuando existe config (`KAFKA_BROKERS`, `DEBEZIUM_CONNECT_URL`, `REDIS_URL`).
2. Revisar reporte auditable generado en `.drift/reports/service-reality-*.json`.
3. Revisar reporte multiprotocolo en `.drift/reports/integration-surface-*.json`.

Uso recomendado por entorno:
- `staging`:
  - PowerShell: `$env:INTEGRATION_PROBES_FILE='config/integration-probes.staging.example.json'; npm run verify:surface`
- `prod`:
  - PowerShell: `$env:INTEGRATION_PROBES_FILE='config/integration-probes.prod.example.json'; npm run verify:surface`

Plantillas listas:
- `config/integration-probes.staging.example.json`
- `config/integration-probes.prod.example.json`
3. Interpretación:
  - `verified_real`: respuesta real validada contra contrato.
  - `failed_real`: hubo respuesta real pero no cumple contrato / error real.
  - `skipped_missing_auth`: no se pudo verificar por falta de credenciales.
  - `skipped_missing_dependency`: falta herramienta de ejecución (ej. `grpcurl`).
  - `skipped_missing_config`: falta config de probe (ej. DB URL).

Ejemplo de `INTEGRATION_PROBES_JSON`:
```json
[
  {
    "type": "graphql",
    "id": "gql:catalog",
    "url": "https://api.example.com/graphql",
    "authEnvVar": "GRAPHQL_TOKEN"
  },
  {
    "type": "grpc",
    "id": "grpc:health",
    "target": "grpc.example.com:443",
    "method": "grpc.health.v1.Health/Check",
    "data": {"service": ""}
  },
  {
    "type": "sql",
    "id": "sql:orders",
    "connectionEnvVar": "ORDERS_DB_URL",
    "query": "select 1 as ok",
    "expectedMinRows": 1
  },
  {
    "type": "kafka",
    "id": "kafka:orders",
    "brokersEnvVar": "KAFKA_BROKERS",
    "topic": "integrax.orders"
  },
  {
    "type": "cdc",
    "id": "cdc:orders-connector",
    "url": "http://debezium:8083/connectors/orders-connector/status",
    "expectedConnectorState": "RUNNING",
    "expectedTaskState": "RUNNING"
  },
  {
    "type": "webhook",
    "id": "webhook:ingress",
    "url": "https://api.example.com/webhooks/orders",
    "hmacSecretEnvVar": "WEBHOOK_SECRET",
    "signatureHeader": "X-Signature"
  },
  {
    "type": "redis",
    "id": "redis:cache",
    "urlEnvVar": "REDIS_URL"
  }
]
```

## Cómo saber si está desactualizado
- Ejecutar drift check: `npx tsx scripts/run-drift-check.ts`
- Si aparece `major` o `critical`, el contrato o la integración quedó desalineada y requiere actualización.

## Onboarding obligatorio para cada servicio nuevo
1. Agregar contrato en [contracts/ts/src/connector-contracts.ts](contracts/ts/src/connector-contracts.ts).
2. Agregar test de contrato en [contracts/ts/src/__tests__/contract-tester.test.ts](contracts/ts/src/__tests__/contract-tester.test.ts) o suite específica.
3. Definir variables de entorno requeridas en [.env.example](.env.example) y [.env.production.example](.env.production.example).
4. Registrar endpoint OpenAPI para drift check en [scripts/run-drift-check.ts](scripts/run-drift-check.ts).
5. No permitir fallback demo en `prod`.
