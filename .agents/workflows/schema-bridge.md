---
description: Guía para Claude Code sobre el desarrollo y evolución del Schema Bridge y Similarity Engine
---

# Desarrollo de Schema Bridge (`packages/schema-bridge`)

Estás encargado del desarrollo del `SimilarityEngine` y el `SchemaDiffer`. Tu objetivo principal en esta área es **asegurar que la lógica de comparación resuelva correctamente los casos de negocio antes de intentar cablear todo el sistema (Temporal/Kafka/BBDD).**

## REGLA DE ORO

**Tu prioridad es expandir las capacidades de mapeo del motor usando "Value-Based Matching" y soportar estructuras anidadas pesadas.**
El `smoke-test.ts` sirvió para validar la línea de base. Ahora Antigravity se encarga de orquestar el SchemaBridge en Temporal y cachear los requerimientos en Redis.

TUS OBJETIVOS ACTUALES (Semana Cruzada - Architectural Hardening & Information Gain):
1. **Margen de Confianza Relativo (Information Gain)**: Elimina el umbral mágico de `0.95`. El auto-accept solo debe ocurrir si la distancia (`Δ`) entre el Candidato #1 y el Candidato #2 es abrumadora (ej. > 0.40). Si hay competencia (todos sacan >0.90), es *ambiguo* por solapamiento de IDs de alta entropía. 
2. **Abandona el Regex Monolítico (Pluggable Ontologies)**: Deja de hardcodear `ar-money` o `lat-lon` en el engine. Modifica el motor para que acepte un diccionario de ontologías (formatos conocidos) pasados como configuración desde el exterior (`SchemaBridgeOptions`), permitiendo que crezca infinitamente sin tocar el core.
3. **Graph Distance vs Array Count**: Reemplaza la ingenua función `arrayDepth` que cuenta corchetes `[*]`. Implementa una comparación estructural que entienda cuando un sistema aplana una jerarquía (1:N a plana).
4. **Smoke Test - Data Sucia**: Deja de probar muestras perfectas. Crea un escenario de test (`runDisjointSparseScenario`) donde las muestras de SAP (lunes) y las de Coupa (martes) NO compartan ningún valor en común (`overlapRatio = 0`), y tengan 80% de nulos (Sparse Arrays), para obligar al motor a no depender exclusivamente de overlap de valores.

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
