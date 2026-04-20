# @integrax/module-ecommerce

Full ecommerce capability module. Wraps Medusa.js behind an `MedusaAdapter` boundary so the rest of the platform never imports Medusa types directly.

**Exports:** `EcommerceService`, `MedusaAdapter`, `createMedusaAdapter`, `MedusaAdapterNotConfiguredError`, `moduleManifest`, canonical types: `CatalogItem`, `Cart`, `CheckoutSession`, `Order`, `Customer`, `FulfillmentRequest`, `ReturnRequest`, etc.

**Key operations:** catalog CRUD, cart management, checkout, discount/promo, customer accounts, draft orders, fulfillment, returns, inventory allocation.

**Consumers:** `services/control-plane` (platform + ecommerce routes), `profiles/ecommerce`.

**Note:** `MedusaAdapter` is optional — if not configured, `EcommerceService` throws `MedusaAdapterNotConfiguredError`. The module can run without Medusa for basic catalog/order operations.
