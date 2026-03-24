---
description: Guía para Claude Code sobre el desarrollo y evolución del Schema Bridge y Similarity Engine
---

# Desarrollo de Schema Bridge (`packages/schema-bridge`)

Estás encargado del desarrollo del `SimilarityEngine` y el `SchemaDiffer`. Tu objetivo principal en esta área es **asegurar que la lógica de comparación resuelva correctamente los casos de negocio antes de intentar cablear todo el sistema (Temporal/Kafka/BBDD).**

## REGLA DE ORO

**Tu prioridad es expandir las capacidades de mapeo del motor usando "Value-Based Matching" y soportar estructuras anidadas pesadas.**
El `smoke-test.ts` sirvió para validar la línea de base. Ahora Antigravity se encarga de orquestar el SchemaBridge en Temporal y cachear los requerimientos en Redis.

TUS OBJETIVOS ACTUALES (Semana Cruzada - Refactor Value-Matching):
1. **Matching por Entropía vs Hardcoding**: Elimina los filtros estrictos (`NUMERIC_LIKE_PATTERN` ignorando números puros, eliminación de fechas, y requisito de `size >= 2`). En lugar de IGNORAR esos valores, usa matemáticas de entropía/cardinalidad. Un número puro de muchos dígitos (un foreign key) debería matchear si coincide, mientras que un "1" contra un "1" tiene baja entropía y debería tener un score mínimo. Si ambos arrays solo tienen "ARS" constante (`size === 1`), debe haber score (aunque menor al que tendrían si coincidieran 10 IDs diferentes).
2. **Eliminar Sesgos Regionales**: Minimizar `STOP_VALUE_TOKENS` hardcodeados en inglés; rely más en algoritmos matemáticos probabilísticos para que escale a cualquier ERP / idioma.
3. **Optimización Continua**: Mantén el coverage del 100% en el `smoke-test` (¡no lo rompas!), confirmando que tu nueva estrategia probabilística sopesa mejor todas las fuentes sin hardcodear filtros.

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
