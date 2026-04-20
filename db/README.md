# db/

Migraciones SQL de Postgres. Se ejecutan en orden numérico.

| Migración | Qué crea |
|---|---|
| `001_initial_schema.sql` | tenants, connectors, workflows, audit |
| `002_add_channel_hits.sql` | métricas de uso por canal |
| `003_reconciliation.sql` | tablas de reconciliación |
| `004_snapshots.sql` | entity_snapshots |
| `005_timeline.sql` | entity_timeline |
| `006_operations.sql` | operations, operation_attempts, approvals |
| `007_identity_aliases.sql` | identity_alias (mapping externo → canónico) |
| `009_drift_incidents.sql` | drift_incidents |
| `010_drift_llm_analysis.sql` | análisis LLM de drift |
| `011_row_level_security.sql` | RLS por tenant |
| `012_onboarding.sql` | estado de onboarding por tenant |
| `013_license.sql` | license_keys, license_heartbeats |

No hay migration runner automático — se aplican manualmente o via CI.
