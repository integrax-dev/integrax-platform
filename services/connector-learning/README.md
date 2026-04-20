# connector-learning

Puerto 3002. Aprende APIs de conectores automáticamente usando LLM.

Dado el ID de un conector, busca documentación pública, parsea los endpoints, y genera un esquema OpenAPI + código de conector. Resultado se guarda para uso del connector-watchdog.

Archivos clave:
- `doc-fetcher.ts` — descarga docs de la API
- `api-parser.ts` — extrae endpoints y schemas
- `learning-engine.ts` — orquesta fetch + parse + generación con LLM
- `code-generator.ts` — genera código TypeScript del conector

Requiere: `ANTHROPIC_API_KEY`.
