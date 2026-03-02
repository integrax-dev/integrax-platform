# Auditoría técnica — integrax-platform

Fecha: 2026-03-02
Estado: Cerrada (runtime crítico/alto)

## Resumen ejecutivo (para dirección)

- Se cerró la ronda de hardening de runtime y workflows.
- No quedan riesgos críticos, altos ni medios abiertos en producción.
- El principal riesgo eliminado fue loop no acotado en orquestación LLM.
- Se endureció configuración Kafka/SASL con fail-fast ante config parcial.
- Se corrigieron cierres de servicios para evitar procesos colgados.
- Se normalizó parseo de puertos/límites para evitar valores inválidos.
- Se eliminó duplicación de validadores en Temporal con util compartido.
- El riesgo residual actual se limita a scripts/tests de desarrollo local.
- Los gates de calidad y validación de servicios pasan en verde.
- Recomendación: cerrar ciclo y abrir solo mejoras no bloqueantes.

## Resumen ejecutivo

- Riesgos críticos/altos en runtime: **0 pendientes**.
- Riesgos medios en runtime: **0 pendientes**.
- Riesgos bajos pendientes: concentrados en **scripts/tests de desarrollo** (no path productivo).
- Validación: `pnpm run quality:gate` en verde.

## Matriz de hallazgos y correcciones

| Severidad | Archivo | Hallazgo | Acción aplicada | Estado |
|---|---|---|---|---|
| Alta | services/llm-orchestrator/src/llm-client.ts | Posible loop de tool-calls sin cota | Límite duro `DEFAULT_MAX_TOOL_ROUNDS` + error controlado | Cerrado |
| Alta | services/tenant/src/eventRouter.ts | Config SASL parcial y dispatch in-memory incompleto | Fail-fast SASL, parse brokers, consumers in-memory por tenant/group, límite de memoria | Cerrado |
| Media | services/realtime/src/server.ts | Timer periódico sin cleanup garantizado | `statsInterval` con `clearInterval` en shutdown idempotente | Cerrado |
| Media | services/realtime/src/index.ts | Parseo laxo de `WS_PORT` / `pingInterval` | Parseo positivo robusto + nullificación de timer en stop | Cerrado |
| Media | services/kafka-consumer/src/index.ts | Shutdown no idempotente y sidecar sin cierre explícito | `consumer.stop`, disconnect seguro, cierre sidecar, shutdown idempotente | Cerrado |
| Media | services/control-plane/src/server.ts | `limit/offset/PORT` parseados sin guardas | Parseo numérico robusto con fallback | Cerrado |
| Media | workflows/temporal/src/worker/index.ts | Cierre por señales sin idempotencia | Shutdown idempotente y sin `process.exit` prematuro | Cerrado |
| Media | workflows/temporal/src/activities/payment-activities.ts | Parseo brokers/puerto duplicado y laxo | Refactor a util compartido + validaciones | Cerrado |
| Media | workflows/temporal/src/activities/order-activities.ts | Parseo brokers/puerto duplicado y laxo | Refactor a util compartido + validaciones | Cerrado |
| Mejora | workflows/temporal/src/utils/env.ts | Duplicación de helpers | Centralización `parsePositiveInt` + `parseCsvList` | Cerrado |

## Pendientes no críticos (scope dev/test)

- Defaults locales en scripts/tests (por ejemplo `localhost`, `integrax`): se mantienen por DX local.
- No se detectaron `eval`, `new Function`, ni ejecución dinámica de comandos en runtime productivo auditado.

## Evidencia de validación

- Gate global: `pnpm run quality:gate` ✅
- Verificación de servicios: `pnpm run validate:services` ✅

## Nota de alcance

Esta auditoría cubre runtime principal de servicios y workflows, además de scripts de verificación vinculados al pre-audit. Los pendientes listados son de entorno de desarrollo y no alteran el perfil de riesgo de producción.
