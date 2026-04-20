# Setup para levantar IntegraX (guía para humanos)

Esta guía es para que puedas clonar el repo y levantar el stack local sin pisar los “footguns” típicos.

Antes de empezar: leé **`MUST_READ.md`** (es corto y te ahorra horas).

## Requisitos

- **Docker Desktop** (con engine corriendo)
- **Node.js** `>= 18` (recomendado LTS)
- **pnpm** `>= 8` (el repo fija `pnpm@8.15.0` en `package.json`)

## 1) Instalar dependencias del monorepo

En el root del repo:

```bash
pnpm install
```

## 2) Levantar servicios base (Postgres, Redis, Activepieces, observabilidad)

```bash
pnpm docker:mvp
```

Checks rápidos:

- Activepieces health: `http://localhost:8080/api/v1/health` → debe dar `200`
- Grafana: `http://localhost:3000` (en el compose MVP Grafana expone `:3000`)

Si Activepieces se cae, mirá:

```bash
docker logs integrax-activepieces --tail 120
docker logs integrax-postgres --tail 120
```

## 3) Levantar el Control Plane

El control-plane carga env desde `services/control-plane/.env`.

Variables **obligatorias** para dev:

- `JWT_SECRET`
- `DATABASE_URL`
- `CREDENTIAL_ENCRYPTION_KEY` (si falta, el server corta con `[FATAL] ...`)
- `ACTIVEPIECES_BASE_URL` (usar `http://localhost:8080/api`)
- `ACTIVEPIECES_API_KEY` (debe coincidir con `AP_API_KEY` del compose)

Arranque:

```bash
pnpm dev:control-plane
```

Health:

- `http://localhost:3000/health`

## 4) Levantar el Admin Panel

En otra terminal:

```bash
pnpm -C apps/admin-panel dev
```

Por defecto Vite proxya `/api` hacia `http://localhost:3000` (ver `apps/admin-panel/vite.config.ts`).

## 4.b) Levantar `integrax-dashboard` (repo/carpeta aparte)

En algunos setups, el “dashboard” no es `apps/admin-panel` sino una carpeta **hermana** del monorepo llamada `integrax-dashboard/` (al mismo nivel que `integrax-platform/`).

Como no vive en este repo, la regla es:

- El dashboard tiene que llamar a **control-plane** en `http://localhost:3000`.
- Si usa rutas relativas (ej: `/api/...`), entonces su dev server debe **proxyar** `/api` a `http://localhost:3000`.
- Si usa base URL explícita, seteá la que corresponda a su repo (mirá su `.env.example`) a `http://localhost:3000`.

Debug rápido:

- Abrí DevTools → Network y buscá la request que falla.
- Si ves `401` a endpoints tipo `/api/ap/pieces`, falta login/JWT (ver `MUST_READ.md` → “login rápido”).
- Si ves `ERR_CONNECTION_REFUSED` o CORS, el proxy/base URL del dashboard está mal configurado.

## 5) Si algo falla (lo más común)

- **“Activepieces no disponible / Failed to fetch”**
  - Confirmá que Activepieces responda `200` en `http://localhost:8080/api/v1/health`.
  - Confirmá que el control-plane tenga `ACTIVEPIECES_BASE_URL=http://localhost:8080/api`.
  - Confirmá que el API key vaya por header `x-api-key` (esto ya está ajustado en el código).

- **`database "activepieces" does not exist`**
  - Si el volumen de Postgres ya existía, los init scripts no corren.
  - Crear DB manualmente (ver `MUST_READ.md`).

## 6) Comandos útiles

```bash
pnpm docker:mvp:logs
pnpm docker:mvp:down
```
