# realtime

Puerto 3003. WebSocket server con auth JWT y aislamiento por tenant via Redis pub/sub.

Conexión: `ws://host:3003?token=JWT_TOKEN`. Canales: `workflows`, `events`, `connectors`, `alerts`, `system`.

Escala horizontalmente — múltiples instancias comparten estado via Redis.

Requiere: `JWT_SECRET` (FATAL), `REDIS_URL` (FATAL).
