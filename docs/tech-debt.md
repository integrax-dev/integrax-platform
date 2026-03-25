# Deuda Técnica — IntegraX Platform

Registro de decisiones intencionalmente diferidas.
Cada ítem documenta: qué es, por qué se postergó, y cuándo/cómo activarlo.

---

## TD-001 — Cache distribuido para Mapping Memory (control-plane)

**Prioridad:** Baja — activar cuando haya 2+ réplicas del control-plane.

El `mapping-memory-repository` cachea en memoria (Map in-process) las entradas de
feedback operativo. TTL de 60 s, LRU 500 entradas. Con una sola instancia es perfecto.

**Cuándo se convierte en problema:** primera vez que haya `replicas: 2` detrás de un
load balancer. Un operador rechaza un mapeo en réplica 1; réplica 2 sigue sirviendo
el mapeo rechazado hasta que vence el TTL.

**Cómo activar — una línea en `server.ts`:**
Descomentar el bloque `DEUDA TÉCNICA` en [`services/control-plane/src/server.ts`](../services/control-plane/src/server.ts).
Requiere `REDIS_URL` en el entorno (ya está en el stack MVP).

```typescript
import { Redis } from 'ioredis';
import { RedisCacheAdapter } from './store/redis-cache-adapter.js';
import { setCacheAdapter } from './store/mapping-memory-repository.js';

if (process.env.REDIS_URL) {
  setCacheAdapter(new RedisCacheAdapter(new Redis(process.env.REDIS_URL)));
}
```

---

## TD-002 — Rate limiter distribuido (control-plane)

**Prioridad:** Baja — mismo trigger que TD-001 (2+ réplicas).

El rate limiter actual usa contadores in-process. Con múltiples réplicas un cliente
puede hacer N req/s × R réplicas antes de ser limitado.

**Cómo activar:** reemplazar el store in-memoria por Redis `INCR` + `EXPIRE`
(sliding window). El `REDIS_URL` ya está disponible si TD-001 fue activado.

---

## TD-003 — Reportes narrativos de drift en lenguaje natural (llm-orchestrator)

**Prioridad:** Baja — activar cuando un cliente lo pida explícitamente.

`services/llm-orchestrator/src/drift-analyzer.ts` existe pero no está integrado a
ningún endpoint. La escalación LLM para decisión de campos ambiguos ya está resuelta
en `packages/schema-bridge/src/llm-escalation.ts` — eso no es lo que queda acá.

Lo que queda: dado un `BridgeReport` ya generado, producir una explicación narrativa
en español para el operador. Es UX, no precisión.

**Cómo activar:**
1. Endpoint `POST /api/schemas/reports/:id/explain` en `routes/schemas.ts`
2. Handler carga el report de Postgres → llama `drift-analyzer.analyzeReport(report)`
3. Devuelve markdown/texto para el panel de admin

---

## TD-004 — Paginación por cursor en listTenants (control-plane)

**Prioridad:** Baja — activar cuando haya decenas de miles de tenants.

`store/tenants.ts → listTenants()` usa paginación por offset (`LIMIT $1 OFFSET $2`).
Con > 10.000 tenants, los offsets altos hacen full-scan de la tabla.

**Cuándo se convierte en problema:** si la plataforma supera ~10.000 tenants y
el endpoint `GET /api/tenants` empieza a tardar > 200ms en páginas tardías.

**Cómo migrar:** reemplazar offset por cursor basado en `(created_at, id)`:
```sql
WHERE created_at > $cursor_at OR (created_at = $cursor_at AND id > $cursor_id)
ORDER BY created_at ASC, id ASC
LIMIT $page_size
```
El response debe incluir un `nextCursor` opaco en lugar de `page/totalPages`.
