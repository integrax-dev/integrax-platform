# services/

Servicios corriendo como procesos independientes. Cada uno tiene su propio puerto y `package.json`.

| Servicio | Puerto | Qué hace |
|---|---|---|
| `control-plane` | 3000 | API REST principal — tenants, conectores, operaciones, módulos de dominio |
| `connector-learning` | 3002 | Aprende APIs de conectores con LLM; genera esquemas automáticamente |
| `connector-watchdog` | — | Detecta drift en schemas de conectores; crea PRs automáticos |
| `kafka-consumer` | — | Consume topics Kafka/Debezium y dispara workflows Temporal |
| `llm-orchestrator` | 3001 | Interpreta intenciones en lenguaje natural; selecciona conectores con Claude |
| `metrics` | — | Exportador Prometheus |
| `realtime` | 3003 | WebSocket con JWT + Redis pub/sub para eventos en tiempo real |
| `secrets` | — | Integración HashiCorp Vault para secrets de tenants |
| `tenant` | 3004 | Gestión multi-tenant (aislamiento, límites, RBAC) |

Todos usan pnpm, TypeScript 5.3, Node 18+.
