# IntegraX — Reglas de Arquitectura

> **Para quién:** Todo el equipo (devs, tech leads, colaboradores externos).
> **Por qué existe:** Estas reglas protegen el diferencial del producto.
> No son opcionales.

---

## La regla más importante

```
Todo lo inteligente vive en Schema Bridge.
El engine de integración solo ejecuta.
```

Si una decisión de negocio, una transformación de datos o un criterio de matching
termina en un flow de Activepieces (o de cualquier engine futuro), el producto
se convierte en un wrapper. Un wrapper no tiene valor.

---

## Las tres capas y qué pertenece a cada una

### 1. `packages/schema-bridge` — El core del producto

Contiene: lógica de comparación de schemas, scoring de confianza, memoria de
feedback, reservoir de samples, escalación LLM.

**Regla:** Cero dependencias hacia `packages/integration-engine` o cualquier
engine externo. Tiene que poder correr como biblioteca standalone.

### 2. `packages/integration-engine` — El adaptador de ejecución

Contiene: la interfaz `IntegrationEngine` y **una sola implementación** en
`src/activepieces/` (o el engine actual). La interfaz es el contrato; la
implementación es un detalle intercambiable.

**Regla de coupling:** La palabra "Activepieces" (o el nombre de cualquier
engine) **solo puede aparecer** dentro de `src/<engine-name>/`. Cero menciones
en comentarios, nombres de variables de entorno, exports del index, o en
cualquier otro paquete del monorepo.

**Verificación:**
```bash
# Este comando tiene que dar CERO resultados fuera de src/activepieces/:
grep -r -i "activepieces" services/ packages/schema-bridge/ connectors/
```

### 3. `services/`, `apps/`, `workers/` — La plataforma

Hablan con `packages/integration-engine` a través de `IntegrationEngine`.
No saben qué engine hay debajo.

---

## Flujo de dependencias (unidireccional)

```
schema-bridge          (no depende de nada interno)
      ↑
schema-bridge-piece    (plugin del engine — usa schema-bridge + SDK del engine)
      ↑
integration-engine     (adapter — implementa IntegrationEngine con el engine actual)
      ↑
control-plane          (API — usa IntegrationEngine, nunca el engine directamente)
```

Si tenés que agregar una flecha que va en la dirección contraria, la decisión
está mal.

---

## Qué hacer cuando cambia el engine

Si en el futuro se reemplaza Activepieces por n8n, Zapier, un engine propio, etc.:

1. Crear `packages/integration-engine/src/<nuevo-engine>/index.ts` que implemente
   `IntegrationEngine`.
2. Actualizar `packages/integration-engine/src/index.ts` para que `createEngine()`
   instancie el nuevo adapter.
3. Eliminar `src/activepieces/`.
4. **Cero cambios** en `services/`, `apps/`, `workers/`, `packages/schema-bridge`.

Si el paso 4 requiere cambios, hay un leak de coupling que hay que corregir primero.

---

## IdMapper — cómo manejar IDs que no coinciden

Los engines externos usan nombres distintos para el mismo concepto de "tenant"
(`project` en Activepieces, `workspace` en n8n, `organization` en Zapier).

`IdMapper` resuelve esto sin tocar la interfaz:

```typescript
// Ejemplo: tenantId interno ≠ projectId del engine
const engine = createEngine({
  tenantRef: (tenantId) => `org-${tenantId}`,
  flowId: (_tenantId, flowId) => externalFlowIds[flowId],
});
```

Por defecto es passthrough (identidad). Solo se configura cuando hay divergencia.

---

## Variables de entorno del engine

Siempre genéricas, nunca con el nombre del engine actual:

```
INTEGRATION_ENGINE_URL      # no: ACTIVEPIECES_URL
INTEGRATION_ENGINE_API_KEY  # no: ACTIVEPIECES_API_KEY
```

---

## Schema Bridge como producto standalone

El objetivo a mediano plazo es que `packages/schema-bridge` pueda venderse como:
- API standalone con su propia autenticación
- Plugin para sistemas externos (Salesforce, SAP, etc.)
- Librería npm pública

Para que esto sea posible, tiene que mantenerse libre de cualquier dependencia
del resto del monorepo de IntegraX.

**Dependencias permitidas para schema-bridge:**
- `@anthropic-ai/sdk` (LLM escalation)
- `@integrax/logger` (logging estructurado)
- `ioredis` (cache distribuido, opcional)
- `pg` (persistencia de memoria)
- Cero dependencias hacia otros paquetes de `packages/`, `services/`, `workers/`.
