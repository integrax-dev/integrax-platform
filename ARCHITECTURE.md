# Arquitectura de IntegraX

## Que es esta plataforma

Una plataforma operativa impulsada por conectores que detecta inconsistencias entre sistemas, permite operar desde una UI unificada, orquesta workflows y mantiene un estado canonico de entidades; **no** es una herramienta de automatizacion generica ni un simple wrapper de APIs.

## Mapa de paquetes

```
packages/
  entities/              Tipos canonicos sin dependencias. Todo depende de esto.
  platform-kernel/       Diff generico + resolucion de identidad. Sin conocimiento de entidades.
  event-bus/             Bus de eventos tipado en proceso. Sin dependencia de Kafka.
  reconciliation-engine/ Match/diff/politicas por entidad (product, customer, invoice).
  snapshot-store/        Ultimo estado canonico conocido por entidad y sistema origen.
  webhook-ingestion/     Validacion HMAC, normalizacion de payload y encolado de eventos.
  polling-scheduler/     Lectura incremental con cursor -> eventos sinteticos.
  workflow-engine/       Definicion de flujos + catalogo de nodos. Agnostico al runtime.
  integration-engine/    Adaptador HTTP hacia el runtime de workflows (hoy Activepieces).
  schema-bridge/         Comparacion de esquemas para detectar drift de APIs.
  connector-sdk/         SDK base que extienden todos los conectores.
  health/                Utilidades de health/readiness checks.
  logger/                Logging estructurado (pino).
  metrics/               Middleware de Prometheus.

connectors/
  implementations/       Un directorio por conector. Cada uno es autocontenido.

runtime/
  activepieces-adapter/  Compila IntegraxFlow -> JSON de Activepieces. Reemplazable.

modules/
  consistency-inspector/ Detecta divergencias de stock/precio/factura/estado entre conectores.
  orders/                (planificado) Gestion del ciclo de vida de pedidos.
  inventory/             (planificado) Sincronizacion y reserva de stock.
  billing/               (planificado) Generacion y seguimiento de facturas.
  catalog/               (planificado) Sincronizacion de catalogo de productos.

country-packs/
  ar/                    Reglas de CUIT/CAE/AFIP. La plataforma base NO depende de esto.

profiles/
  ecommerce/             (planificado) Modulos, workflows y presets de UI para ecommerce.

services/
  control-plane/         API REST. Monta rutas para todos los paquetes.
  llm-orchestrator/      Lenguaje natural -> workflow via Claude.
  realtime/              WebSocket/SSE para actualizaciones vivas de la UI.
  tenant/                Gestion multitenant.
  drift-engine/          Deteccion de drift en esquemas de APIs.
  connector-watchdog/    Monitoreo de salud de conectores.
  connector-learning/    Aprendizaje de specs con ayuda de LLM.
```

## Grafo de dependencias (sin ciclos)

```
entities                        (sin dependencias)
country-packs/ar                (sin dependencias)
platform-kernel                 <- entities
event-bus                       (sin dependencias)
reconciliation-engine           <- connector-sdk
snapshot-store                  <- entities, platform-kernel
webhook-ingestion               <- event-bus
polling-scheduler               <- event-bus
workflow-engine                 <- entities, event-bus
integration-engine              (sin dependencias del workspace)
runtime/activepieces-adapter    <- workflow-engine, integration-engine
modules/consistency-inspector   <- entities, platform-kernel, reconciliation-engine, snapshot-store, event-bus
services/control-plane          <- todos los paquetes (capa de orquestacion)
```

## Principios clave

- **Limite del conector**: los conectores contienen solo auth, HTTP, paginacion, reintentos, rate limiting, definiciones de webhook/polling y manifest. No llevan logica de negocio.
- **Capa de entidades**: todas las operaciones entre conectores usan entidades canonicas de `@integrax/entities`, nunca tipos propios de un conector.
- **Core agnostico al pais**: las reglas especificas de AR viven en `country-packs/ar`. Los paquetes base funcionan sin eso.
- **Runtime reemplazable**: quien llama depende de `RuntimeAdapter`, no de Activepieces. Cambiando el adaptador se cambia el runtime de workflows.
- **Orientado a eventos**: todos los cambios de estado fluyen por `@integrax/event-bus`. Las actualizaciones de UI, los triggers de workflow y las notificaciones se suscriben ahi.
