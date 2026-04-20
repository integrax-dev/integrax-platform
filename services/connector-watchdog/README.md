# connector-watchdog

Monitorea cambios en los schemas de APIs de conectores. Cuando detecta drift, crea un PR automático con el fix.

Archivos clave:
- `schema-fingerprinter.ts` — genera hash estable del schema de una API
- `fingerprint-store.ts` — guarda/carga fingerprints en disco
- `drift-detector.ts` — compara fingerprint baseline vs actual
- `evidence-builder.ts` — empaqueta muestras HTTP + schema como evidencia
- `pr-service.ts` — crea PR en GitHub con el diff
- `watchdog.ts` — orquestador principal

Requiere: `GITHUB_TOKEN` para crear PRs. Expone métricas Prometheus en puerto configurable.
