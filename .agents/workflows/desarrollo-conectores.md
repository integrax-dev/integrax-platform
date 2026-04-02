---
description: Crear y modificar conectores de IntegraX Platform utilizando el SDK
---

# Desarrollo de Conectores (IntegraX)

Esta skill define cómo crear e implementar un conector usando el SDK `@integrax/connector-sdk` y la estructura de IntegraX OSS.

## Principios
1. Todo nuevo conector debe vivir bajo `connectors/implementations/<nombre-conector>`.
2. Evita buscar `package-lock.json` o `pnpm-lock.yaml`. Revisa `package.json` para saber dependencias instaladas.

## Pasos para crear o modificar un conector
1. Ve al directorio (ej. `connectors/implementations/mi-conector`).
2. Configuración (`config.ts` o equivalente): Exporta una constante de tipo `ConnectorConfig` que defina `id`, `name`, `auth`, de acuerdo a las interfaces en `connectors/sdk/typescript`.
3. Implementación de acciones: Importa `ConnectorResult` y `RetryableError`. Devuelve un objeto `{ success: true, data: result }` o lanza errores en caso HTTP 5xx.
4. Si la API externa lanza un fallo transitorio, lanza `new RetryableError('mensaje', { maxRetries: 3 })`.

**Importante:** Nunca borres código o reescribas todo el archivo a menos que sea un reemplazo directo. Usa herramientas de reemplazo por bloque (ej. replace/multi_replace).
