# module-handlers/

Handler del OperationEngine dispatcher para cada módulo de dominio. Un archivo por módulo.

`index.ts` construye el mapa `moduleHandlers: Record<string, ModuleHandlerFn>` que consume `engine.ts`.

**Para agregar un módulo nuevo:**
1. Crear `<modulo>.ts` exportando `moduleId: string` y `handle: ModuleHandlerFn`
2. Agregar un import en `index.ts`
3. `engine.ts` no se toca.

Módulos actuales: `billing`, `inventory`, `payments`, `ecommerce`.
