# store/

Acceso a Postgres y Redis. Un archivo por entidad o concern.

| Archivo | Qué persiste |
|---|---|
| `db.ts` | Pool de conexión Postgres (`pg`) compartido |
| `tenants.ts` | CRUD de tenants |
| `tenant-connectors.ts` | Conectores configurados por tenant (credenciales cifradas AES-256) |
| `tenant-module-config.ts` | Configuración de módulos per-tenant (ej. Medusa URL para ecommerce) |
| `pg-snapshot-store.ts` | Snapshots canónicos de entidades |
| `pg-operation-store.ts` | Operaciones y attempts del OperationEngine |
| `pg-approval-store.ts` | Operaciones en estado `awaiting_approval` |
| `pg-idempotency-store.ts` | Claves de idempotencia para deduplicar operaciones |
| `pg-timeline-store.ts` | Historial de cambios de entidades |
| `pg-identity-alias-store.ts` | Mapeo de IDs externos a IDs canónicos |
| `drift-store.ts` | Incidentes de drift y análisis LLM |
| `mapping-memory-repository.ts` | Memoria de mapeos de schemas (schema-bridge) |
| `cache-adapter.ts` | Cache en memoria con LRU eviction |
| `redis-cache-adapter.ts` | Cache Redis (alternativa distribuida) |
| `credits.ts` | Créditos por tenant |
| `storage-quota.ts` | Cuota de storage por tenant |
