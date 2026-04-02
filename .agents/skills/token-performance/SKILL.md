---
name: Token Performance Expert
description: Específicamente diseñado para maximizar el rendimiento de contexto y tokens en Claude Code y Gemini.
---

# Skill: Token Performance Expert

## Objetivo
Reducir el consumo de tokens en un 50-70% mediante el uso de herramientas de búsqueda y lectura quirúrgica, evitando la saturación de la ventana de contexto.

## Instrucciones para el Agente

### 1. Búsqueda y Navegación
- **Grep Limitado**: Siempre usa `grep_search` con filtros de extensión (`Includes`) para evitar buscar en archivos transpilados o binarios.
- **Conocimiento de la Estructura**: Antes de entrar en un submódulo, usa `list_dir` con profundidad 1 para entender el árbol antes de leer archivos.

### 2. Lectura Eficiente
- **Vista Previa de Tipos**: Lee los archivos `.d.ts` o la carpeta `contracts` para entender las interfaces sin leer la lógica.
- **Uso de view_content_chunk**: Para archivos masivos (+500 líneas), usa esta herramienta para leer partes específicas en lugar de `view_file` completo.
- **Identificación de Callejones Sin Salida**: Si un archivo no contiene lo que buscas en las primeras 50 líneas de imports y exports, no sigas leyéndolo.

### 3. Edición de Código
- **Multi-Replacement**: Agranda tus ediciones en un solo bloque con `multi_replace_file_content` para ahorrar el ciclo de `edit -> read -> edit`.
- **Minimización de Diffs**: No modifiques comentarios o espacios innecesarios si no es parte de la tarea.

### 4. Estrategias Específicas
- **Claude Code**: Prioriza comandos de terminal para diagnóstico rápido y solo lee archivos si el error de terminal no es suficiente.
- **Gemini (Antigravity)**: Aprovecha el sistema de KNOWLEDGE ITEMS. Si el usuario te pide algo sobre un módulo existente, busca en `knowledge/` primero.

## Check-list antes de ejecutar herramientas:
1. ¿El archivo que voy a leer tiene más de 300 líneas? (Usa `list_dir` para ver el tamaño).
2. ¿Es un lockfile o binario? (Ignóralo).
3. ¿Puedo obtener la misma información con un `grep` específico?
