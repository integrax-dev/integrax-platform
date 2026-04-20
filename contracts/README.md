# contracts/

Especificaciones de la API y schemas de datos. No contiene lógica ejecutable.

- `openapi/control-plane.yaml` — spec REST del control-plane
- `asyncapi/events.yaml` — spec de eventos Kafka/WebSocket
- `schemas/` — JSON Schemas de tenant, workflow, connector
- `ts/` — tipos TypeScript generados desde los schemas
- `samples/` — ejemplos de payloads para testing

Los tipos en `ts/` son la fuente de verdad para validación en runtime (usados via Zod en el control-plane).
