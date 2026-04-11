# Ecommerce Boundaries

Rules for keeping the ecommerce layer properly isolated from the platform core.

---

## Ecommerce is one profile/module family

The ecommerce capability lives in:
- `modules/ecommerce/` — ecommerce domain logic + Medusa adapter
- `modules/orders/` — order lifecycle (shared with non-ecommerce use cases)
- `modules/catalog/` — product sync (shared with non-ecommerce use cases)
- `modules/inventory/` — stock management (shared)
- `modules/payments/` — payment collection (shared — not ecommerce-only)
- `profiles/ecommerce/` — composition declaration

**Not a framework. Not the center. One profile family.**

---

## What is ecommerce-specific vs platform-generic

| Concept | Layer |
|---|---|
| Cart, LineItem, CheckoutSession | Ecommerce only (`modules/ecommerce`) |
| Discount, DiscountRule, Promotion | Ecommerce only |
| CatalogItem, Variant, PriceList | Ecommerce only (maps to canonical `Product` for reconciliation) |
| FulfillmentRequest, ReturnRequest | Ecommerce only |
| Payment, Subscription, Refund | Platform-generic (`packages/entities`, `modules/payments`) |
| Order, Invoice, Stock, Customer | Platform-generic (`packages/entities`, respective modules) |
| Event bus, snapshot-store, timeline | Platform core — never ecommerce-specific |

---

## Things that must NOT happen

1. **`packages/entities` must not contain ecommerce-specific types** (Cart, LineItem, Discount). Those live in `modules/ecommerce/src/types.ts`.

2. **`modules/payments` must not know about Carts or Checkout**. It knows about `Payment`, `Subscription`, and `Refund`. The integration happens via events and workflows.

3. **`packages/reconciliation-engine` must not import ecommerce types**. It reconciles `CanonicalProduct`, `CanonicalCustomer`, `CanonicalInvoice` — not `CatalogItem` or `Cart`.

4. **The ecommerce profile must not hardcode MercadoPago**. The payments module is provider-neutral. The ecommerce layer uses `modules/payments` → operation-engine → whichever connector the tenant configured.

5. **Medusa must not replace platform core**. Medusa handles product/cart data models. IntegraX handles events, snapshots, operations, reconciliation, and multi-connector sync.

---

## Adding a new vertical profile (e.g., Healthcare)

A healthcare profile uses the same platform core but different modules:

```typescript
export const healthcareProfile: Profile = {
  id: 'healthcare',
  modules: ['billing', 'patients', 'appointments'],
  // No ecommerce module. No Medusa dependency.
  primaryEntities: ['Invoice', 'Customer'],
  ...
};
```

The ecommerce module does not activate. Medusa does not activate. Payments module is available if needed for billing/collections. This is the multi-profile architecture.

---

## Ecommerce and reconciliation

The ecommerce layer is subject to the same reconciliation logic as any other module:

```
External catalog (TiendaNube connector) → polling → snapshot_store (entityType: 'product', sourceSystem: 'tiendanube')
Internal catalog (ecommerce module)     → create   → snapshot_store (entityType: 'catalog_item', sourceSystem: 'ecommerce')

ConsistencyInspector.inspect(tenantId, 'product')
  → groups by canonicalId
  → compares TiendaNube snapshot vs ecommerce snapshot
  → detects price divergence, stock divergence, status mismatch
  → emits conflict.detected
  → writes timeline entry
```

Medusa is just a data store for the ecommerce module. The reconciliation logic doesn't know or care.
