# MUST READ — Local Dev Setup (IntegraX)

Este repo tiene varios “footguns” de configuración que te pueden hacer perder tiempo. Si estás levantando el stack local, leé esto primero.

## 0) Señales rápidas (qué está bien / qué está roto)

- **Grafana**: logs tipo `No last resource version found, starting from scratch` son *normales* (polling interno).
- **Activepieces**:
  - Debe responder `200` en `http://localhost:8080/api/v1/health`.
  - Si ves `Failed to fetch` o “Activepieces no disponible” en la UI, casi siempre es **(a)** Activepieces caído o **(b)** control-plane apuntando mal.

## 1) Stack MVP con Docker Compose

El compose principal del MVP está en:

- `infra/docker-compose/mvp/docker-compose.yml`

### Bases de datos requeridas

Postgres en el compose usa `POSTGRES_DB=integrax` (DB principal). Además, el stack necesita:

- `n8n`
- `activepieces`

Se crean desde `infra/docker-compose/mvp/init-db.sql`. Nota: los scripts en `docker-entrypoint-initdb.d` **solo corren en el primer arranque** del volumen de Postgres.

Si el volumen ya existía y te falta la DB `activepieces`, la solución rápida es crearla manualmente:

```bash
docker exec -i integrax-postgres psql -U integrax -d postgres -c "CREATE DATABASE activepieces;"
```

## 2) Activepieces (muy importante)

### URLs correctas

Activepieces expone su API bajo `/api`:

- Salud: `http://localhost:8080/api/v1/health`
- Pieces: `http://localhost:8080/api/v1/pieces`

Para evitar confusiones, en `services/control-plane/.env` usamos:

- `ACTIVEPIECES_BASE_URL=http://localhost:8080/api`

### Autenticación correcta

Para llamadas server-to-server, Activepieces espera el API key por header:

- `x-api-key: <AP_API_KEY>`

**No** usar `Authorization: Bearer ...` (da `401`).

### Variables críticas de Activepieces

En `infra/docker-compose/mvp/docker-compose.yml`:

- `AP_ENCRYPTION_KEY` **debe** ser hex de 32 caracteres (16 bytes). Si no, Activepieces crashea en startup.
- `AP_POSTGRES_*` debe apuntar a la DB `activepieces`.

## 3) Control Plane (muy importante)

El control-plane requiere una key para cifrar credenciales de conectores en la DB.

En `services/control-plane/.env`:

- `CREDENTIAL_ENCRYPTION_KEY` **obligatoria** y de al menos 32 caracteres.

Si falta, vas a ver:

`[FATAL] CREDENTIAL_ENCRYPTION_KEY is not set. Connector credentials cannot be stored safely.`

## 4) Comandos de verificación (copy/paste)

### Health de Activepieces

```bash
curl -i http://localhost:8080/api/v1/health
```

### Pieces (con API key)

```bash
curl -i http://localhost:8080/api/v1/pieces?limit=1 -H "x-api-key: ap-internal-key-changeme"
```

### Logs útiles

```bash
docker logs integrax-activepieces --tail 120
docker logs integrax-postgres --tail 120
```

## 4.1) Admin-panel: login rápido (para probar /api/*)

El proxy de Activepieces en control-plane (por ejemplo `/api/ap/pieces`) requiere JWT.
Para obtener uno rápido en dev:

```bash
curl -s http://localhost:3000/api/admin/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@integrax.io","password":"integrax-dev"}'
```

## 4.2) Si usás `integrax-dashboard` (carpeta/repo aparte)

Si el UI que estás usando es `integrax-dashboard/` (no el `apps/admin-panel` de este monorepo), los síntomas suelen ser iguales:

- “Activepieces no disponible” + “Failed to fetch”

Checklist:

- Control-plane arriba: `http://localhost:3000/health` → `200`
- Activepieces arriba: `http://localhost:8080/api/v1/health` → `200`
- El dashboard está llamando a control-plane (proxy o base URL correcta).
- Si la request a `/api/ap/pieces` devuelve `401`, falta JWT/login (ver sección 4.1).

## 5) Troubleshooting (errores típicos)

### `database "activepieces" does not exist`

- Causa: DB no creada (volumen ya existía y no corrió `init-db.sql`).
- Fix: crear DB con `docker exec ... CREATE DATABASE activepieces;` (ver sección 1).

### `relation "users" does not exist` (o tablas faltantes)

- Causa: migraciones no corrieron (o fallaron) y el control-plane queda a medias.
- Fix: reiniciar `pnpm dev:control-plane` y mirar el log “Running migrations”. Si una migración falla por `already exists`, normalmente se puede reintentar (idempotente) o, en dev, resetear la DB.

### `AP_ENCRYPTION_KEY is missing or invalid... 32-character hexadecimal`

- Causa: `AP_ENCRYPTION_KEY` no cumple formato.
- Fix: setear un valor hex de 32 chars en el compose.

### `401 No autorizado` al llamar a Activepieces

- Causa: auth header incorrecto.
- Fix: usar `x-api-key`.
