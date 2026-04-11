---
description: Crear/editar Temporal Workflows y Activities en la plataforma
---

# Temporal Workflows & Activities (IntegraX)

Guía para desarrollar Workflows y Activities en `workflows/temporal`.

## Principios
- Todos los Workflows van en `workflows/temporal/src/workflows/`.
- Todas las Activities van en `workflows/temporal/src/activities/`.

## Restricciones en Workflows (Determinismo Estricto)
- NUNCA uses funciones variables en el tiempo como `Math.random()` o `Date.now()`.
- Usa siempre el equivalente exportado por el framework de Temporal (`@temporalio/workflow`).
- NUNCA introduzcas I/O, llamadas de red o logs asíncronos en las funciones de workflow. Todo lo que interactúa con el mundo exterior **debe** hacerse mediante Activities importadas.

## Implementación
- Las Activities sí pueden fallar o realizar llamadas de red.
- Si usas conectores externos, invoca la actividad base `executeConnector` configurada por la plataforma en lugar de implementar a cada rato un fetch de red.
