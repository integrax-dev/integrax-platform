---
description: Mejores prácticas de rendimiento de contexto para la IA (Token Performance)
---

# Token Performance y Gestión de Contexto

Esta skill define restricciones inquebrantables de eficiencia de tokens al interactuar con IntegraX, asegurando un uso bajo de memoria, lecturas veloces y nula degradación por archivos masivos.

## 1. Archivos Prohibidos o Extremadamente Grandes (Evita a toda costa)
- **NUNCA** intentes leer archivos `pnpm-lock.yaml`, `package-lock.json`, o cualquier binario/dump de BBDD.
- Evita explorar recursivamente (`list_dir`) directorios como `node_modules`, `.git` o `.next`. Usa `fd` u opciones exclusivas.

## 2. Lectura y Búsqueda Quirúrgica
- Antes de leer un archivo completo, realiza un `grep_search` muy restrictivo de la función o id que buscas para ver qué archivos valen la pena abrir.
- Usa los argumentos `StartLine` y `EndLine` para leer solo los bloques de la función objetivo. Leer un archivo de 2000 líneas degrada la performance sin motivo.

## 3. Edición Mínima e Inteligente
- Al aplicar código a un archivo existente, si los cambios están acotados a unas líneas específicas, confía en editores específicos de línea y diff (`replace_file_content` o `multi_replace_file_content`).
- NO reescribas el contenido total del archivo en memoria ni lo escupas completo como respuesta, cuesta costosos tokens de salida. Ocurrirán fallos de context window y errores extraños.

## 4. Obtención De Tipos Globales
- Para entender cuáles son las interfaces de Connectors, Tenants, u objetos grandes, es suficiente con leer a primera pasada en `contracts/`, o en `types.ts` ubicados en los `src/` roots o `sdk/typescript/src/`. No trates de adivinarlos de los puntos de uso (handlers).
