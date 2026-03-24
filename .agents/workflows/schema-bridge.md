---
description: Guía para Claude Code sobre el desarrollo y evolución del Schema Bridge y Similarity Engine
---

# Desarrollo de Schema Bridge (`packages/schema-bridge`)

Estás encargado del desarrollo del `SimilarityEngine` y el `SchemaDiffer`. Tu objetivo principal en esta área es **asegurar que la lógica de comparación resuelva correctamente los casos de negocio antes de intentar cablear todo el sistema (Temporal/Kafka/BBDD).**

## REGLA DE ORO

**Tu prioridad es que el archivo `packages/schema-bridge/tests/smoke-test.ts` pase.**
El `smoke-test.ts` valida un caso real y recurrente: mapear SAP (`BUKRS`, `LIFNR`, `NAME1`) contra Coupa/TiendaNube (`companyCode`, `supplierNumber`, `supplierName`).

NO implementes infraestructura persistente (Postgres, RabbitMQ, Kafka, ni orquestadores) hasta que el comando `npx ts-node packages/schema-bridge/tests/smoke-test.ts` imprima `✅ RESULTADO: SUCCESS`.

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
