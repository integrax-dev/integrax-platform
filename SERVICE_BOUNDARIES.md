# Service Boundaries

Defines what belongs where in the IntegraX platform. When in doubt, apply these rules before adding code anywhere.

---

## services/control-plane

**Is:** HTTP surface, composition root, wiring entrypoint.

**Contains:**
- Express routes: auth, tenants, connectors, operations, schemas, reconciliation, webhooks, snapshots, timeline
- Request validation (Zod), auth middleware, audit logging
- Container sub-modules (`src/platform/container/`) that wire singletons together
- Postgres store implementations (`src/store/pg-*.ts`) — thin adapters, no business logic
- Connector tester registry (`src/store/connector-testers.ts`)

**Must not contain:**
- Business logic (billing rules, payment flows, fiscal validation)
- Provider-specific code outside the connector layer
- Connector test logic inline in route handlers (use `connector-testers.ts`)

**Rule:** If you write `if (connector === 'mercadopago')` in a route handler, it belongs in the connector facade or connector-testers registry.

---

## connectors/implementations/\<connector\>/

**Is:** Provider-specific integration. The only place a PSP or external service is known.

**Contains:**
- `connector.manifest.ts` — declarative capabilities, entity mappings, field mappings
- `src/index.ts` — API client, action implementations
- `facade/facade.ts` — ConnectorFacade adapter (thin wrapper)

**Must not contain:**
- Reconciliation logic (belongs in `packages/reconciliation-engine`)
- Business policy rules (belongs in modules or policies)
- Cross-connector identity resolution (belongs in `packages/platform-kernel`)
- Country-specific fiscal rules (belongs in `country-packs/`)

---

## packages/ — core platform packages

| Package | Owns |
|---|---|
| `entities` | Canonical type definitions (no logic) + payment provider matrix |
| `platform-kernel` | Generic diff, identity resolution, duplicate detection |
| `event-bus` | Typed event registry, InMemoryEventBus, DLQ |
| `snapshot-store` | Last-known canonical entity state |
| `timeline` | Append-only audit log |
| `webhook-ingestion` | Signature validation, normalize, enqueue |
| `polling-scheduler` | Cursor-based incremental fetch |
| `workflow-engine` | Flow schema types (no runtime) |
| `operation-engine` | Command lifecycle: validate → plan → execute → snapshot → event → timeline |
| `integration-orchestrator` | Webhook/polling → canonicalize → snapshot → event → timeline loop |
| `reconciliation-engine` | Cross-system entity consistency: match, diff, policy, actionability enrichment |
| `schema-bridge` | Schema drift: infer, diff, resolve, impact scoring, remediation hints |

**Rule:** Packages must not import from `modules/` or `services/`. Modules import from packages. Services import from both.

---

## modules/

**Is:** Domain capability layers. Operate on canonical entities from `packages/entities`.

**Rule:** A module that contains `MercadoPagoPayment` or `ContabiliumInvoice` types has a boundary violation. It should only know `Payment` and `Invoice` from `packages/entities`.

### Billing vs Payments boundary

| Concern | Module |
|---|---|
| Invoices, fiscal docs, CAE, comprobantes | `modules/billing` |
| Payment collection, authorization, capture, refunds | `modules/payments` |
| Subscription billing cycles | `modules/payments` |
| Invoice generation triggered by payment | `modules/billing` (called after `payment.captured` event via workflow) |

They are separate modules. They do not import each other.

---

## modules/ecommerce/

**Is:** Ecommerce capability layer. Reuses Medusa via an adapter boundary.

**Contains:**
- `src/medusa-adapter/` — all Medusa-specific code, isolated
- `src/ecommerce-service.ts` — top-level service, uses Medusa adapter + platform core
- `src/types.ts` — ecommerce-layer types (CatalogItem, Cart, CheckoutSession, etc.)

**Rule:** Nothing outside `src/medusa-adapter/` may import Medusa types. The rest of the platform must never know Medusa exists.

---

## profiles/

**Is:** Vertical composition declarations. No runtime logic. Module list + workflow IDs + UI presets.

---

## country-packs/

**Is:** Country-specific validation and document rules. Zero platform dependencies.

**Rule:** Core packages must never import from `country-packs/`. Country packs are additive.
