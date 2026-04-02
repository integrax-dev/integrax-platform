---
title: "Patrón de Retroalimentación Humana vs LLM en Schema Bridge"
description: "Describe el bucle de feedback heurístico y la priorización de memoria histórica (Mapping Memory) contra las escalaciones por LLM en el Schema Bridge."
tags: ["schema-bridge", "explainability", "mapping-memory", "llm-escalation", "architecture"]
---

# Schema Bridge: Human Feedback vs LLM Escalation

El motor probabilístico de `SchemaBridge` está diseñado para balancear la precisión determinística, la robustez heurística de la inteligencia artificial (LLMs) y, fundamentalmente, la retroalimentación de los operadores humanos.

Este documento (Knowledge Item) documenta la arquitectura de ese balance.

## 1. El Costo Computacional y Económico del LLM

El puente de esquemas (`SchemaBridge`) puede analizar miles de ejemplos y cientas de propiedades. Utilizar un modelo como Claude (vía `llm-escalation.ts`) para cada campo es prohibitivamente costoso en tiempo y tokens y, a su vez, genera inconsistencias si se confía mecánicamente en todas las decisiones del LLM.

Por esto, la **escalación al LLM está estrictamente limitada a casos ambiguos** (campos con conflictos semánticos donde los modelos léxicos, estructurales y de valores observados arrojan márgenes de confianza ajustados). 

## 2. El Patrón "Mapping Memory" (Human-in-the-Loop)

Para erradicar la necesidad del LLM en casos que se repiten con el tiempo (por ejemplo, `user_id` -> `customerNumber`), implementamos un proveedor de ontología histórico: el `MappingMemoryProvider`. 

**Mecánica Base:**
1. **Feedback UI**: Un operador humano ve un mapping propuesto por Heurística o por el LLM en el Admin Panel y decide rechazarlo o autorizarlo (AUTO-ACCEPT o REVISION).
2. **Registro de Score**: A través del `Control Plane`, la decisión se persiste (por ej: *1 accepted*, *0 rejected*).
3. **Inyección Dinámica**: Cuando el Schema Bridge recibe el comando de diffing para esos mismos sistemas, el SDK (`schema-bridge-piece`) inyecta dinámicamente este registro en `CompareSchemasRequest.mappingMemory`.
4. **Calculo de Autoridad**: 
   - El Engine usa el score ponderado de aceptaciones/rechazos.
   - Si no hay al menos 3 aceptaciones explícitas (`minFeedbackForAutoAccept = 3`), la puntuación queda "capeada" ("recortada") para ser **provisional** (máximo 0.82) e impactará en el score global, pero NO podrá aplicar un auto-accept (Regla 0) por sí misma.
   - Con ≥ 3 aceptaciones, la memoria humana toma "autoridad absoluta" sobre las otras reglas.
   - Si un mapping genera más de 70% de rechazos (con al menos 3 muestras), se añade un veto y directamente deja de proponerse. 

## 3. Explainability (Explicabilidad de Caja de Cristal)

Para mantener total transparencia respecto a cómo interactúan el LLM y la memoria humana, el engine mapea las decisiones mediante una entidad `MatchExplanation`. 

El output generado (que alimenta a las UI de auditoría de IntegraX) explicita:
- Si fue el LLM, una decisión de memoria o simple heurística la que aprobó la conexión.
- A qué regla del Policy Engine pertenece.
- El score porcentual en campos Léxicos, Valores, Estructura y Ontología.

```text
Decision: AUTO-ACCEPT — Regla 0 — Memoria historica de operadores

  Nombre:       40%  ████░░░░░░  (debil)
  Valores:       0%  ░░░░░░░░░░  (muy debil)
  Estructura:   90%  █████████░  (muy fuerte)
  Semantico:    99%  █████████░  (muy fuerte)
  Margen:       50%  █████░░░░░
  Memoria:     activa — con autoridad de auto-accept
```

## Resumen Arquitectónico:
> **Memoria Humana Consolidada (Regla 0) > Lógica Determinística / Regla Golden (Regla 1) > Escalación LLM (Ambiguos) > Rechazo**
