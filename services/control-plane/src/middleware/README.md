# middleware/

Middleware Express compartido por todas las rutas.

| Archivo | Qué hace |
|---|---|
| `auth.ts` | `requireAuth` (JWT o API Key), `requireRole(...roles)`, `requireTenant` |
| `validate.ts` | `validate(ZodSchema)` — valida `req.body` y devuelve 400 si falla |
| `audit.ts` | `audit(action)` — registra en Postgres qué hizo quién y cuándo |
| `rate-limit.ts` | `rateLimit({maxRequests, windowMs})` — en memoria |
| `rate-limit-redis.ts` | Igual pero usando Redis (para despliegues multi-instancia) |
| `tenant-context.ts` | Extrae `tenantId` del token y lo pone en `req.tenantId` |

Orden estándar en una ruta: `requireAuth → requireRole → requireTenant → validate → audit → handler`.
