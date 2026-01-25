# IntegraX OSS

Plataforma de integraciones orientada a eventos para empresas de Argentina y LatAm. Incluye conectores, contratos (OpenAPI/AsyncAPI/JSON Schema/Proto), workers y workflows (Temporal). Monorepo listo para desarrollo y despliegue.

## 🚀 Quickstart

```bash
pnpm install
pnpm docker:mvp
pnpm dev:worker
```

## Requisitos

- Node.js >= 18
- pnpm >= 8
- Docker Desktop

## Estructura

- `contracts/`: APIs, eventos, schemas y ejemplos
- `connectors/`: SDK + conectores implementados
- `services/`: orquestador LLM, consumidores, etc.
- `workers/`: workers TS y Go
- `workflows/temporal/`: workflows y activities
- `infra/`: docker-compose, observabilidad, k8s
- `scripts/`: utilidades de testing y simulación

## Comandos útiles

- Instalar deps: `pnpm install`
- Build: `pnpm build`
- Tests: `pnpm test`
- Lint: `pnpm lint`

### Docker
- Levantar MVP: `pnpm docker:mvp`
- Bajar MVP: `pnpm docker:mvp:down`
- Logs MVP: `pnpm docker:mvp:logs`
- Levantar Enterprise: `pnpm docker:enterprise`
- Bajar Enterprise: `pnpm docker:enterprise:down`
- Logs Enterprise: `pnpm docker:enterprise:logs`

## Desarrollo local

1. Crear tu env local:
   ```powershell
   Copy-Item .env.example .env
   ```
2. Levantar la infra:
   ```bash
   pnpm docker:mvp
   ```
3. Levantar componentes:
   ```bash
   pnpm dev:worker
   pnpm dev:temporal
   pnpm dev:kafka-consumer
   ```

## Scripts

- `pnpm test:integration` — tests de integración
- `pnpm test:real` — tests reales (requiere infra/credenciales)
- `pnpm simulate:payment` — simula un pago
- `pnpm stress-test` — stress test
- `pnpm setup:debezium` — setup Debezium (enterprise)

## Contratos

- OpenAPI: `contracts/openapi/`
- AsyncAPI: `contracts/asyncapi/`
- Schemas JSON: `contracts/schemas/`
- Samples: `contracts/samples/`

## Principios

- Event-driven por defecto
- Idempotencia en bordes
- Observabilidad end-to-end
- LLM controlado (sin acciones críticas directas)

## Licencia

Apache-2.0
