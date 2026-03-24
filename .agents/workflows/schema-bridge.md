---
description: Guía para Claude Code sobre el desarrollo y evolución del Schema Bridge y Similarity Engine
---

# Desarrollo de Schema Bridge (`packages/schema-bridge`)

Estás encargado del desarrollo del `SimilarityEngine` y el `SchemaDiffer`. Tu objetivo principal en esta área es **asegurar que la lógica de comparación resuelva correctamente los casos de negocio antes de intentar cablear todo el sistema (Temporal/Kafka/BBDD).**

## REGLA DE ORO

**Tu prioridad es expandir las capacidades de mapeo del motor usando "Value-Based Matching" y soportar estructuras anidadas pesadas.**
El `smoke-test.ts` sirvió para validar la línea de base. Ahora Antigravity se encarga de orquestar el SchemaBridge en Temporal y cachear los requerimientos en Redis.

TUS OBJETIVOS ACTUALES (Semana 3):
1. **Hardening de Falsos Positivos**: El "Value-Based Matching" es poderoso, pero si `quantity` siempre es `1` y `status_id` siempre es `1`, generarán un match incorrecto. Debes endurecer la heurística valorando la entropía y diversidad de los datos.
2. **Estructuras Anidadas**: El motor ahora debe procesar objetos profundos, por ejemplo, IDs de arrays anidados (`E1BPADDR1[*].CITY` en SAP IDOCs).
3. **Optimización Continua**: Mantén tu coverage del 100% y cero llamadas al LLM para conectores base.

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
