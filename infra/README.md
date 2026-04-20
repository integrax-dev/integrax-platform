# infra/

Infraestructura local y de producción.

## docker-compose/
- `mvp/` — stack local mínimo: Postgres, Redis, n8n, Worker, OTEL, Prometheus, Loki, Grafana
- `enterprise/` — stack completo: agrega Vault, Debezium, Alertmanager, Temporal, Kafka
- `e2e/` — stack para tests end-to-end
- `self-hosted/` — configuración para deployments self-hosted de clientes

Comandos: `pnpm docker:mvp` / `pnpm docker:enterprise`.

## observability/
Configs de Prometheus (scraping), Grafana (dashboards), Loki (logs), OTEL Collector (traces), Alertmanager (alertas).
