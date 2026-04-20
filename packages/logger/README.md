# @integrax/logger

Structured logging for IntegraX services. JSON in production, pretty-printed in development.

**Exports:** `createLogger(options)` → pino logger with `service`/`version`/`env` fields; `requestLogger` → Express middleware that logs each request with `correlationId` and `tenantId`; `Logger` type.

**Child loggers:** call `logger.child({ tenantId, correlationId })` — all fields propagate automatically.

**Consumers:** every service and worker in the monorepo.
