# Medusa Adapter

The Medusa adapter (`modules/ecommerce/src/medusa-adapter/`) is the isolation boundary between Medusa and IntegraX.

---

## Architecture rule

**Nothing outside `modules/ecommerce/src/medusa-adapter/` may import Medusa types.**

The adapter communicates with Medusa via its REST API — it does NOT import `@medusajs/medusa` or any Medusa SDK directly. This makes:
- The peer dependency truly optional
- The adapter testable without a running Medusa instance (mock the HTTP layer)
- Medusa replaceable without touching the rest of the platform

---

## File structure

```
modules/ecommerce/src/medusa-adapter/
  types.ts      — Minimal Medusa model shapes (only fields we map)
  catalog.ts    — MedusaProduct ↔ CatalogItem translation
  carts.ts      — MedusaCart ↔ Cart translation
  adapter.ts    — MedusaAdapter class — all HTTP calls to Medusa
```

---

## Configuration

```typescript
import { createMedusaAdapter } from '@integrax/module-ecommerce';

const adapter = createMedusaAdapter({
  medusaBaseUrl: 'http://localhost:9000',
  medusaAdminApiKey: process.env.MEDUSA_ADMIN_API_KEY,
  tenantId: 'tenant-123',
});

// null = Medusa not configured. EcommerceService falls back to snapshot-store.
const ecommerce = new EcommerceService(store, bus, timeline, adapter);
```

---

## Without Medusa

When Medusa is not configured (`createMedusaAdapter(null)` or missing env vars):
- Read operations fall back to `snapshot-store` (populated by connector polling/webhooks)
- Write operations that require Medusa throw a descriptive error pointing to configuration
- The platform continues to function for all non-ecommerce modules

---

## Adding new Medusa concepts

To add a new Medusa-backed concept (e.g., gift cards):

1. Add minimal Medusa types to `types.ts` (only the fields you need)
2. Add a translation file (e.g., `gift-cards.ts`) with `medusaXxx → IntegraXXxx` functions
3. Add methods to `adapter.ts`
4. Expose them through `EcommerceService`
5. Do NOT expose Medusa types in `EcommerceService`'s public interface

---

## Why not import `@medusajs/medusa` directly?

1. Medusa v1 and v2 have very different APIs — HTTP adapter is version-agnostic
2. `@medusajs/medusa` is a heavy dependency (Typeorm, etc.) — not worth pulling into every service
3. HTTP boundaries are testable with simple mocks
4. Medusa is optional — platforms without ecommerce should not carry the dependency
