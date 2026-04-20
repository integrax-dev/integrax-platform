# scripts/

Scripts de utilidad para desarrollo, testing y setup. Se ejecutan con `tsx`.

| Script | Qué hace |
|---|---|
| `simulate-payment.ts` | Simula un pago end-to-end |
| `stress-test.ts` | Stress test de la API |
| `test-integration.ts` | Tests de integración contra APIs reales |
| `test-real.ts` | Tests con credenciales reales de conectores |
| `seed-business-dataset.ts` | Puebla la DB con datos de prueba |
| `seed-reports.ts` | Genera reportes de ejemplo |
| `setup-debezium.ts` | Configura Debezium CDC |
| `learn-api.ts` | Dispara aprendizaje de API via connector-learning |
| `run-drift-check.ts` | Ejecuta verificación de drift manualmente |
| `validate-persistence.ts` | Verifica que los stores Postgres funcionan |
| `validate-service-registry.ts` | Verifica que todos los servicios responden |
| `verify-integration-surface.ts` | Audita la superficie de integración |

No son parte del build — solo para uso local.
