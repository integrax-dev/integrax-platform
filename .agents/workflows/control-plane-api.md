---
description: Modificar endpoints y lógica del Control Plane API
---

# Control Plane API (IntegraX)

Guía para añadir o modificar endpoints RESTful y la gestión central de la API de administración ubicada en `services/control-plane`.

## Arquitectura y Rutas
- Todas las rutas principales están bajo `services/control-plane/src/`.
- Las validaciones usan **Zod**.

## Multi-Tenancy (Estricto)
- Al agregar cualquier endpoint bajo el paraguas protegido, DEBE extraer el context de `tenantId` (ya sea por un encabezado `X-Tenant-Id` si es apikey, o del claim de JWT inserto en la request `req.tenant`).
- Operaciones a estructuras o almacenamiento (actualmente In-Memory) deben filtrar inmediatamente por `tenantId` para aislar datos.

## Control de Acceso (RBAC)
- Emplea los middlewares apropiados:
  - `requireAuth` para parsear y verificar el token/API-key.
  - `requireRole(['rol_nombre'])` si el endpoint es exclusivo de `platform_admin` o similares.
- Todos los modelos y esquemas JSON globales para endpoints están en `contracts/schemas/` o `/contracts/openapi/`. Considera usarlos antes que reescribir tipos de Typescript duplicados.
