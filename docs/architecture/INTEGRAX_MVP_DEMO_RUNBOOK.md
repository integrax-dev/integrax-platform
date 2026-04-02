# IntegraX MVP Demo Runbook

## Objetivo

Mostrar una historia de producto clara:

1. una integración crítica existe y estaba sana
2. la API upstream cambió
3. IntegraX detectó el drift
4. IntegraX clasificó el riesgo
5. IntegraX propuso mappings
6. el operador dejó feedback
7. la memoria operativa quedó persistida

## Preparación

### 1. Infra MVP

Levantar la infraestructura mínima:

```powershell
npm run docker:mvp
```

### 2. Seed de demo

Cargar el escenario reproducible:

```powershell
npm run seed:mvp-demo
```

Este seed deja preparado:

- tenant demo `ten_mvp_demo`
- conectores `mercadopago`, `contabilium`, `email`
- schemas versionados
- diff report real
- mapping memory inicial
- incidentes y feedback compatibles con el panel

### 3. Apps

Levantar backend y panel:

```powershell
pnpm --filter @integrax/control-plane dev
pnpm -C apps/admin-panel dev
```

Si hiciste cambios en servicios auxiliares, regenerar artefactos:

```powershell
npm -C services/contract-intelligence run build
npm -C services/drift-engine run build
npm -C services/learning-loop run build
```

## Login

Usar credenciales de entorno del admin.

En local/test, si no configuraste otras:

- email: `admin@integrax.io`
- password: `integrax-dev`

## Recorrido recomendado

### Paso 1. Dashboard

Abrir `Dashboard`.

Qué contar:

- hay actividad real en las últimas 24h
- hay conectores configurados
- hay incidentes abiertos
- hay coverage promedio y feedback reciente

Qué señalar visualmente:

- cards de `Incidentes Abiertos`
- card de `Coverage Promedio`
- bloque `Recorrido Demo`

Mensaje sugerido:

> IntegraX no solo ejecuta integraciones; también observa cambios contractuales y mide qué tan recuperable es la situación.

### Paso 2. Incidents

Abrir `Incidents`.

Qué contar:

- Mercado Pago hacia Contabilium sufrió drift
- el incidente quedó clasificado con severidad y status
- esto ya no es solo observabilidad: es operación

Qué mostrar:

- incidente `mercadopago -> contabilium`
- `severity`
- `compatibilityClass`
- `changeCount`
- transición a `investigating` o `resolved`

Mensaje sugerido:

> Acá el operador ve el problema en términos operativos: qué flujo está en riesgo y si conviene bloquear, investigar o resolver.

### Paso 3. Schema Diffs

Abrir `Schema Diffs`.

Qué contar:

- el sistema identifica renames probables
- detecta cambios incompatibles
- propone mappings con confidence

Qué mostrar:

- `coveragePercent`
- `breakingCount`
- mappings sugeridos
- feedback `accept/reject`

Mensaje sugerido:

> IntegraX no se queda en “la API cambió”; intenta cerrar la brecha entre esquemas y proponer continuidad operativa.

### Paso 4. Feedback del operador

En el reporte seleccionado, aceptar o rechazar al menos un mapping.

Qué contar:

- el operador corrige o valida una decisión
- esa decisión no se pierde
- se transforma en memoria reutilizable

Mensaje sugerido:

> Este es el punto donde la plataforma aprende. El feedback no es un parche manual: pasa a ser signal persistida.

### Paso 5. Mapping Memory

Abrir `Mapping Memory`.

Buscar:

- `connectorAId = mercadopago`
- `connectorBId = contabilium`

Qué mostrar:

- entradas acumuladas
- `acceptedCount`
- `rejectedCount`
- `averageConfidence`
- `lastAcceptedAt`

Mensaje sugerido:

> Lo diferencial es que la resolución operativa queda guardada por tenant y por par de conectores. La próxima vez, IntegraX arranca con ventaja.

### Paso 6. Events

Abrir `Events`.

Qué contar:

- el panel deja trazabilidad de drift, feedback y resolución
- no es una UI aislada: hay timeline operativo

Qué mostrar:

- eventos `schemas.diff.start`
- `schemas.feedback`
- `incidents.investigating`
- `incidents.resolve`

## Historia corta para demo comercial

Versión de 3 minutos:

1. `Dashboard`: “vemos incidentes abiertos y coverage afectado”
2. `Incidents`: “identificamos el flujo en riesgo”
3. `Schema Diffs`: “vemos los cambios y aceptamos un mapping”
4. `Mapping Memory`: “la plataforma aprendió”

## Historia larga para demo técnica

Versión de 7 a 10 minutos:

1. infraestructura mínima y seed reproducible
2. dashboard con métricas reales
3. incidente abierto
4. diff de schema y classification
5. feedback del operador
6. memory persistida
7. events timeline
8. cierre con arquitectura modular

## Comandos de verificación

Backend:

```powershell
npx tsc -p services\control-plane\tsconfig.json --noEmit
node .\node_modules\.pnpm\vitest@4.0.18_@types+node@20.19.30_tsx@4.21.0_yaml@2.8.2\node_modules\vitest\vitest.mjs run services\control-plane\src\routes\admin.test.ts services\control-plane\src\routes\incidents.test.ts services\control-plane\src\routes\schemas.test.ts
```

Frontend:

```powershell
pnpm -C apps/admin-panel typecheck
```

## Qué no mostrar

No conviene abrir scope durante la demo con:

- marketplace
- builder visual completo
- conectores no relacionados con el caso
- flujos que no estén seedados
- infraestructura enterprise fuera del happy path MVP

## Mensaje final

La frase de cierre recomendada es:

> IntegraX convierte cambios de API en un flujo operable: detecta el drift, clasifica el riesgo, propone mappings, captura feedback y acumula memoria por tenant.
