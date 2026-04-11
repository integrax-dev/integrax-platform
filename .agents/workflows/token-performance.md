---
description: Mejores prácticas de rendimiento de contexto para la IA (Token Performance)
---

# Token Performance y Gestión de Contexto Avanzada

Este workflow define reglas estrictas para maximizar la "densidad de información" en el contexto, reduciendo el ruido y optimizando el consumo de tokens para evitar latencia y degradación del modelo.

## 1. Estrategia de Búsqueda "Gris" (No Binaria)
- **Filtro de Ruido:** Nunca listes directorios sin exclusiones. Usa `grep_search` con `--max-count` y `--max-depth`.
- **Deducción de Tipos:** Antes de leer la implementación (`.ts`, `.tsx`), busca los tipos en `packages/contracts`, `types/` o `index.d.ts`. Comprender la "forma" de los datos ahorra leer cientos de líneas de lógica.

## 2. Lectura y Consumo de Archivos
- **Cero Dump de Archivos:** Está **PROHIBIDO** leer archivos de más de 300 líneas completos.
- **Lectura en Chunks:** Si realmente necesitas el archivo completo, léelo en bloques de 50-100 líneas (`StartLine`, `EndLine`) enfocándote únicamente en las secciones relevantes.
- **Lockfiles y Binarios:** Nunca intentes leer `pnpm-lock.yaml`, `package-lock.json` o archivos `.map`. Son "pozos de tokens".

## 3. Optimización para Claude Code
- **Compactación del Contexto:** Claude Code tiene una ventana muy eficiente pero sensible a la repetición. Evita re-listar el mismo directorio varias veces.
- **Multi-Replace:** Usa `multi_replace_file_content` para ediciones complejas en lugar de múltiples `replace_file_content` que fuerzan al modelo a re-leer el archivo en cada paso.

## 4. Optimización para Gemini (Antigravity)
- **Uso de la Ventana Larga:** Gemini puede manejar contextos masivos, pero la latencia aumenta proporcionalmente. Mantén el contexto limpio para respuestas más rápidas.
- **Knowledge Items (KI):** Antes de investigar, lee los resúmenes de KI. Si ya existe un análisis de arquitectura, no lo repitas. 
- **Comandos ruidosos:** Usa `WaitMsBeforeAsync` cortos para comandos que imprimen mucho texto (como tests) y lee solo las últimas líneas si fallan.

## 5. Gestión del Historial (Clearing Context)
- Si detectas que el historial de conversación contiene bloques de código obsoletos o resultados de tests de 10 steps atrás, solicita al usuario permiso para resumir y reiniciar el contexto (o usa herramientas de truncado si están disponibles).
- **Output de Git:** Los comandos de `git` (como `git log` o `git show`) deben limitarse con `-n 5` o similares.

## 6. Prohibiciones Críticas
- No usar `cat` o `run_command` para leer archivos. Usa `view_file`.
- No pases el contenido de un archivo a un `generate_image` o herramientas externas innecesariamente.
- No realices `list_dir` recursivos sin un propósito inmediato.

---

## Plan de Handoff Actual (Rama: `ID-0012-admin-panel-wiring`)
*Este bloque es para alinear a Claude Code en su próxima ejecución, aplicando las reglas de token performance descritas arriba:*

**Objetivo del Sprint para Claude Code:** Excelencia Operacional e Infraestructura. El `SchemaBridge` y la `MappingMemory` ya fueron cableados algorítmicamente por Antigravity.

**Tareas a Ejecutar:**
1. **Limpieza de Tipos Post-Handoff (`TypeScript`)**: 
   - Ve directo a `packages/schema-bridge-piece` y `packages/schema-bridge`.
   - Ejecuta `pnpm tsc` (o el script de typecheck). Soluciona cualquier error de TS derivado de la reciente inyección de `mappingMemory` sin dar vueltas ni listar directorios enteros.
2. **Estandarización de Logs (`Pino`)**:
   - Revisa `packages/schema-bridge-piece/src/actions/compare-schemas.ts`.
   - Cambia los `console.warn` por el logger formal del `@integrax/logger`. No leas todo el paquete de logger, asume la firma estándar `logger.warn({ err }, 'msg')`.
3. **Versiones de Activepieces**:
   - Actualiza cualquier otra pieza en el monorepo para que coincida con `@activepieces/pieces-framework@0.26.0` (solo modifica los `package.json` necesarios).
4. **Validación de Infraestructura (`Docker`)**:
   - Levanta `pnpm docker:mvp` y asegúrate de que el Admin Panel cargue sin errores de red hacia el Control Plane. Lee solo las últimas 20 líneas de logs de los contenedores si hay fallos.
