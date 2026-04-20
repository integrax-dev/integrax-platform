# workflows/temporal

Workflows durables con Temporal.io. Manejan reintentos, compensaciones y estado a largo plazo.

Workflows: `OrderWorkflow` (validación → pago → factura → notificación), `PaymentWorkflow` (ciclo de vida con compensaciones), `MultiTenantWorkflow` (ejecuta cualquier conector con aislamiento de tenant).

Activities principales: `executeConnector`, `transformData`, `callWebhook`, `validateTenantLimits`, `sendTenantNotification`.

Requiere: `TEMPORAL_ADDRESS`.
