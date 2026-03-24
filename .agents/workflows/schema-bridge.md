---
description: Guía para Claude Code sobre el desarrollo y evolución del Schema Bridge y Similarity Engine
---

# Desarrollo de Schema Bridge (`packages/schema-bridge`)

Estás encargado del desarrollo del `SimilarityEngine` y el `SchemaDiffer`. Tu objetivo principal en esta área es **asegurar que la lógica de comparación resuelva correctamente los casos de negocio antes de intentar cablear todo el sistema (Temporal/Kafka/BBDD).**

## REGLA DE ORO

**Tu prioridad es expandir las capacidades de mapeo del motor usando "Value-Based Matching" y soportar estructuras anidadas pesadas.**
El `smoke-test.ts` sirvió para validar la línea de base. Ahora Antigravity se encarga de orquestar el SchemaBridge en Temporal y cachear los requerimientos en Redis.

TUS OBJETIVOS ACTUALES (Semana Cruzada - Deep Arrays & Type Intelligence):
1. **Arrays de Objetos Profundos**: El motor debe mejorar cómo agrupa y compara paths que contienen arrays anidados (ej. `items[*].sub_items[*].code`). Debes asegurar que la señal de entropía se calcule considerando todos los niveles de profundidad.
2. **Inferencia de Tipos "Smart"**: No te limites a types JSON básicos. Refina la lógica para detectar tipos de negocio comunes por valor (ej. `currency_code` de 3 letras, `email`, `uuid`, `lat_lon`) y usa esto como un multiplicador de confianza en el matching.
3. **Escalación Controlada**: Implementa un "Confident Threshold": si el score combinado es > 0.95, se acepta automáticamente; si está entre 0.70 y 0.95, se marca para "Revisión Humana/LLM" en el DiffResult.
4. **Smoke Test - Nivel 2**: Crea un nuevo test case en `smoke-test.ts` que simule un cambio de versión de un ERP con campos anidados que cambian de nombre simultáneamente.

## Handoff ("Entrega")

Cada vez que termines una iteración exitosa del `schema-bridge`:
1. Crea o actualiza un archivo llamado `TECH_SUMMARY_schema_bridge.md` en la raíz.
2. Explica de forma concisa **qué piezas nuevas agregaste** (sin mostrar código fuente).
3. Enumera las firmas de las funciones principales para que Antigravity sepa cómo usarlas al escribir en `workflows/temporal/src/activities/`.

## Contratos

Tu motor de salida debe ajustarse estricta y rígidamente al esquema `contracts/schemas/schema-diff.schema.json`. Si necesitas modificar el contrato porque descubriste una nueva necesidad, coméntalo en el Pull Request o actualízalo para que Antigravity lo valide.

### Estrategias dentro del SimilarityEngine:
- Expande el diccionario de sinónimos (`SYNONYM_PAIRS` en `similarity-engine.ts`) con términos típicos de SAP (BUKRS, LIFNR, MATNR).
- Las comparaciones siempre deben escalar al LLM SOLO cuando tu score determinístico no sea suficientemente confiable.
