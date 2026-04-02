# Admin / Dashboard Convergence

## Summary

Integrax hoy tiene dos aplicaciones con overlap funcional, pero con backends y modelos distintos:

- `apps/admin-panel` en este monorepo, apoyado sobre `services/control-plane`
- `integrax-dashboard` fuera de este monorepo, apoyado sobre `Supabase + mocks`

La recomendacion es clara:

- usar `admin-panel + control-plane` como base canonica del producto
- tratar `integrax-dashboard` como inventario funcional y referencia de UX
- migrar solo lo que tenga backend real o que este muy cerca de tenerlo
- no copiar vistas del dashboard cliente de forma literal si dependen de un modelo de datos que no existe en Integrax Platform

## Current State

### Progress In This Branch

Avances ya implementados en `admin-dashboard-convergence-connectors`:

- `Connectors` conectada a backend real
- `Connector Detail` creado sobre `control-plane`
- `Workflows` conectado a backend real
- `Workflow Detail` creado sobre `integration-engine`
- `Settings` reescrito sobre `tenants`
- `Dashboard` extendido con snapshot tenant-aware
- `Audit` alineado a auditoria real
- `Observability` nueva, apoyada en `/api/metrics`, `incidents` y `workflows`
- `Approvals` nueva, reinterpretada como bandeja de revision humana sobre `incidents`
- `Conflicts` nueva, reinterpretada como vista de conflictos contractuales sobre `schema reports`

Esto significa que gran parte del valor visible del dashboard cliente ya tiene equivalente operativo dentro del admin panel, sin depender de Supabase directo.

### Admin Panel

Fuente:

- `apps/admin-panel`
- `services/control-plane`

Fortalezas:

- auth y session reales
- tenant context real
- backend HTTP propio
- dominios operativos nuevos de Integrax:
  - incidents
  - schema diffs
  - mapping memory
  - drift / contract intelligence / learning loop

Debilidades:

- `connectors`, `workflows`, `settings` todavia estan menos maduros que en el dashboard cliente
- faltan vistas de detalle
- falta backend customer-facing para algunas vistas

### Customer Dashboard

Fuente:

- `../integrax-dashboard`

Fortalezas:

- mas amplitud funcional en UX
- mejores vistas de:
  - connector detail
  - workflow detail
  - approvals
  - conflicts
  - observability

Debilidades:

- depende de `Supabase` directo desde frontend
- usa un esquema propio (`connectors`, `workflows`, `unified_data`, `conflicts`, `sync_logs`)
- mezcla mocks con runtime
- no comparte source of truth con Integrax Platform

## Shared Domains

Estos dominios existen en ambas apps y conviene convergerlos.

### Dashboard

- admin: `apps/admin-panel/src/pages/Dashboard.tsx`
- cliente: `../integrax-dashboard/src/views/Dashboard.tsx`

Observacion:

- no muestran lo mismo
- admin mide plataforma
- cliente mide operacion de tenant / entidades reconciliadas

Decision:

- compartir shell, auth y tenant context
- no unificar todavia la vista ni los KPIs

### Connectors

- admin: `apps/admin-panel/src/pages/Connectors.tsx`
- cliente: `../integrax-dashboard/src/views/Connectors.tsx`
- backend actual: `services/control-plane/src/routes/connectors.ts`

Decision:

- el backend canonico tiene que ser `control-plane`
- el dashboard cliente deberia dejar de pegar directo a Supabase para este dominio

### Workflows

- admin: `apps/admin-panel/src/pages/Workflows.tsx`
- cliente: `../integrax-dashboard/src/views/Workflows.tsx`
- backend actual: `services/control-plane/src/routes/workflows.ts`

Decision:

- usar runtime y backend de Integrax
- falta un registry persistido para soportar el nivel de UX del dashboard cliente

### Audit

- admin: `apps/admin-panel/src/pages/Audit.tsx`
- cliente: `../integrax-dashboard/src/views/Audit.tsx`
- backend actual: `services/control-plane/src/server.ts`

Observacion:

- hoy el nombre coincide, pero la semantica no
- el admin panel muestra auditoria real
- el dashboard cliente muestra una vista de entidades y estado

Decision:

- conservar la semantica del admin panel como audit real
- si se porta la UX del dashboard, renombrarla o cambiarle el contenido

### Settings

- admin: `apps/admin-panel/src/pages/Settings.tsx`
- cliente: `../integrax-dashboard/src/views/Settings.tsx`

Decision:

- dominio compartible
- requiere backend nuevo

## Migrate

Estas capacidades del dashboard cliente conviene migrarlas al `admin-panel`, pero reescritas sobre backend real.

### Connector Detail

Origen:

- `../integrax-dashboard/src/views/ConnectorDetail.tsx`

Destino recomendado:

- nueva vista en `apps/admin-panel`

Backend base:

- `services/control-plane/src/routes/connectors.ts`

Acciones:

- agregar detalle de conector
- mostrar credenciales/config schema
- mostrar health
- mostrar ultimo sync
- soportar test y sync desde backend

### Workflow Detail

Origen:

- `../integrax-dashboard/src/views/WorkflowDetail.tsx`

Destino recomendado:

- nueva vista en `apps/admin-panel`

Backend base:

- `services/control-plane/src/routes/workflows.ts`

Acciones:

- agregar detalle de workflow
- runs recientes
- estado enabled/disabled
- trigger manual
- cancelacion y estado de runs

### Tenant Dashboard

Origen conceptual:

- `../integrax-dashboard/src/views/Dashboard.tsx`

Destino recomendado:

- nueva vista tenant-facing en `admin-panel`

Backend faltante:

- `GET /api/customer/dashboard`

Acciones:

- separar dashboard de plataforma vs dashboard de tenant
- definir KPIs por tenant

### Observability

Origen:

- `../integrax-dashboard/src/views/Observability.tsx`

Destino recomendado:

- `apps/admin-panel/src/pages/Observability.tsx`

Backend faltante:

- `GET /api/customer/observability`

Acciones:

- runs
- failures
- latency
- connector health
- drift / conflict trend

Estado actual:

- ya existe una primera version sobre:
  - `GET /api/metrics`
  - `GET /api/incidents`
  - `GET /api/workflows`
- sirve para el admin panel actual
- todavia falta un backend customer-facing mas rico

## Rewrite

Estas vistas no conviene copiarlas tal cual.

### Dashboard

Problema:

- depende del dominio `unified_data`
- ese dominio no existe hoy en Integrax Platform

Decision:

- reescribir segun backend real

### Connectors

Problema:

- el dashboard cliente lee y escribe directo contra Supabase

Decision:

- rehacer contra `control-plane`

### Workflows

Problema:

- el dashboard cliente asume tabla `workflows` editable directa
- Integrax hoy tiene runtime/engine, no un registry equivalente

Decision:

- rehacer sobre workflow registry futuro

### Audit

Problema:

- semantica distinta a la del admin panel

Decision:

- no reutilizar tal cual

## Keep Out For Now

Estas piezas no deberian entrar en el primer tramo de convergencia.

### Workflow Builder

Fuente:

- `../integrax-dashboard/src/views/WorkflowBuilder.tsx`

Motivo:

- necesita backend nuevo de definicion de workflows
- hoy no hay contrato estable para builder

### Unified Data

Motivo:

- es un dominio entero que no existe aun en Integrax Platform

### Conflicts

Fuente:

- `../integrax-dashboard/src/views/Conflicts.tsx`

Motivo:

- depende de `unified_data + conflicts`
- no hay backend equivalente en `control-plane`

### Approvals de negocio

Fuente:

- `../integrax-dashboard/src/views/Approvals.tsx`

Motivo:

- no hay dominio backend equivalente hoy para aprobaciones de negocio generalizadas
- el admin panel ahora tiene una version operativa de approvals basada en incidents, pero no reemplaza este dominio futuro

## Missing Backend

Estos son los principales contratos o dominios faltantes para absorber el dashboard cliente.

### Customer Dashboard API

Necesario:

- `GET /api/customer/dashboard`

### Connector Detail API

Necesario:

- `GET /api/connectors/:id`
- `POST /api/connectors/:id/test`
- `POST /api/connectors/:id/sync`

### Workflow Registry

Necesario:

- source of truth persistido para definiciones de workflow
- create / edit / list / version

### Workflow Detail API

Necesario:

- `GET /api/workflows/:id`
- `GET /api/workflows/:id/runs`

### Settings API

Necesario:

- api keys
- webhook secrets
- notification preferences
- plan limits

### Approvals Domain

Necesario:

- `GET /api/approvals`
- `POST /api/approvals/:id/approve`
- `POST /api/approvals/:id/reject`

Estado actual:

- `apps/admin-panel/src/pages/Approvals.tsx` ya cubre un caso real:
  - bandeja de revision humana sobre `incidents`
- no existe todavia el dominio general de approvals de negocio

### Conflicts Domain

Necesario:

- `GET /api/conflicts`
- `POST /api/conflicts/:id/resolve`

Estado actual:

- `apps/admin-panel/src/pages/Conflicts.tsx` ya cubre una primera capa operativa:
  - toma `schema reports`
  - marca conflictos por `breakingCount` y `coveragePercent`
  - deriva a `Schema Diffs`, `Mapping Memory` y `Approvals`
- no existe todavia el dominio general de conflictos de entidades reconciliadas

### Observability API

Necesario:

- `GET /api/customer/observability`

Nota:

- `GET /api/metrics` hoy existe, pero es placeholder

### Unified Data / Reconciliation Domain

Necesario:

- decision de producto y arquitectura
- incorporar este dominio al monorepo o descartarlo explicitamente

## Recommended Ownership

### Canonical Base

- UI: `apps/admin-panel`
- Backend: `services/control-plane`

### Reference Only

- `../integrax-dashboard`

Usarlo para:

- descubrir capacidades utiles
- rescatar patrones de UX
- priorizar backlog

No usarlo como:

- source of truth de datos
- backend canonico
- contrato definitivo

## Recommended Order

### P0

- auth y tenant context compartidos
- connectors list sobre backend real
- workflows list sobre backend real
- tenant dashboard nuevo
- settings minimas reales

### P1

- connector detail
- workflow detail
- audit semantica correcta
- observability real

Estado:

- cumplido en esta rama para una primera convergencia operativa

### P2

- approvals
- conflicts
- unified data
- workflow builder

Refinamiento:

- `approvals` ya tiene una version MVP basada en incidents
- `conflicts` ya tiene una version MVP basada en schema reports
- `unified data` y `workflow builder` siguen fuera del backend canonico

## Final Recommendation

La convergencia correcta no es fusionar dos frontends que hoy viven sobre modelos distintos.

La convergencia correcta es:

- consolidar `admin-panel + control-plane` como base canonica
- migrar solo las capacidades del dashboard cliente que puedan apoyarse en backend real
- crear contratos nuevos donde haga falta
- decidir explicitamente si `unified_data / conflicts / approvals` pasan a ser dominios oficiales de Integrax Platform
