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

---

## Decisiones de arquitectura

### ADR-001: Monolito modular, no microservicios

**Decision**: el control-plane es un monolito. Los modulos (`orders`, `billing`, `ecommerce`, etc.) son paquetes internos con interfaces limpias, no servicios separados.

**Por que**: los microservicios resuelven problemas que hoy no existen — equipos independientes que no pueden deployar sin coordinarse, modulos que necesitan escalar de forma radicalmente distinta, o requisitos de fault isolation estrictos (ej: compliance PCI para billing). Introducirlos ahora agrega latencia de red, distributed tracing obligatorio, contratos de API entre servicios que cambian continuamente, y deploy coordinado de N servicios para cualquier feature.

**Cuando revisar**: cuando un modulo especifico consuma el 80% del CPU mientras el resto esta idle, o cuando haya 3+ equipos que no puedan deployar sin coordinarse, o cuando billing requiera aislamiento PCI certificado.

**Ventaja actual**: cada modulo ya tiene su interfaz. Extraer uno a microservicio en ese momento toma 2 dias, no 2 meses.

---

### ADR-002: Redis Streams como bus de eventos, no Kafka

**Decision**: `@integrax/event-bus` usa `InMemoryEventBus` en desarrollo y `RedisStreamsEventBus` en produccion (cuando `REDIS_URL` esta seteado). Kafka no esta en el stack MVP.

**Por que**: Kafka consume 300-500 MB RAM solo el broker. En el MVP ya corren Postgres, Redis, Activepieces, control-plane y observability. Agregar Kafka en un VPS de 4-8 GB no deja margen. Redis ya esta en el stack — Redis Streams da durabilidad real (eventos sobreviven restarts), consumer groups y replay sin overhead adicional.

**Cuando agregar Kafka**: cuando haya multiples servicios independientes consumiendo el mismo stream (CDC con Debezium, analytics separado, microservicios de terceros). El enterprise docker-compose ya lo incluye para ese momento.

**Implementacion**:
```ts
// services/control-plane/src/platform/container/event-bus.ts
export const eventBus = process.env.REDIS_URL
  ? new RedisStreamsEventBus(process.env.REDIS_URL)
  : new InMemoryEventBus();
```

---

### ADR-003: Escalado horizontal del control-plane

**El control-plane es stateless**. Todo el estado vive en Postgres y Redis. Agregar replicas es levantar mas contenedores apuntando al mismo Postgres y Redis — sin cambios de codigo.

**Escalado vertical vs horizontal**:

| | Vertical | Horizontal |
|---|---|---|
| Que es | Mas CPU/RAM a la misma instancia | Mas instancias identicas detras de un load balancer |
| Cuando usarlo | Primero siempre — mas simple, sin cambios de codigo | Cuando el cuello de botella es concurrencia, no velocidad de computo |
| Limite | El hardware disponible en el proveedor | Teoricamente ilimitado |
| Costo | Lineal con el hardware | Puede ser mas eficiente en picos |
| Prerequisito | Ninguno | El servicio debe ser stateless (el control-plane ya lo es) |

**Secuencia correcta para IntegraX**:

1. **1 replica, VPS 4GB** — hasta ~500 tenants activos simultaneos. Escalar verticalmente primero si hay presion.
2. **2-3 replicas, managed platform** — cuando el vertical ya no alcanza o se necesita zero-downtime deploys. En este punto `InMemoryEventBus` queda inutilizable (eventos publicados en replica A nunca llegan a suscriptores en replica B). Redis Streams resuelve esto automaticamente.
3. **Auto-scaling** — cuando el trafico tenga picos predecibles (ej: horario comercial). Render y Fly.io lo manejan sin configuracion manual.

**El dashboard no escala igual**: es un build estatico. Va en un CDN (Cloudflare Pages) — escala infinito, costo cero, sin replicas que manejar.

---

### ADR-004: Hosting

**Decision**: no Hostinger VPS para produccion. Hostinger es infraestructura manual — nginx, certificados, restarts, balanceo de carga y actualizaciones son responsabilidad del equipo.

**Stack recomendado**:

| Componente | Proveedor | Por que |
|---|---|---|
| control-plane | Render o Fly.io | Deploy desde Docker, auto-scale, zero-downtime, health checks nativos |
| Postgres | Render Managed DB o Neon | Backups automaticos, replicas de lectura, sin mantenimiento |
| Redis | Render Redis o Upstash | Managed, persistencia configurada, sin mantenimiento |
| Dashboard | Cloudflare Pages | CDN global, gratis, deploy desde git |
| Activepieces | Fly.io o Railway | Necesita estado persistente (volumes) |

**Fly.io tiene ventaja para LatAm**: tiene region `gru` (Sao Paulo) y `scl` (Santiago) — latencia significativamente menor para usuarios de Argentina y Chile comparado con us-east.
