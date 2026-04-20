# modules/

Domain capability modules. Each module encapsulates a business area as a service class + manifest. Modules are registered in the control-plane container and exposed under `/api/platform/tenants/:tenantId/*`.

| Module | Package | Capability |
|--------|---------|-----------|
| `billing` | `@integrax/module-billing` | Invoice generation, CAE authorization, payment status |
| `catalog` | `@integrax/module-catalog` | Product publish, price updates, cross-connector sync |
| `consistency-inspector` | `@integrax/module-consistency-inspector` | Detects cross-system divergence, emits conflict events |
| `ecommerce` | `@integrax/module-ecommerce` | Full ecommerce capability (carts, checkout, fulfillment) behind Medusa adapter |
| `inventory` | `@integrax/module-inventory` | Stock sync, reservation, low-stock alerts |
| `orders` | `@integrax/module-orders` | Order lifecycle: create, confirm, cancel, refund |
| `payments` | `@integrax/module-payments` | PSP-neutral payment layer: authorize, capture, refund, subscribe |

Every module exports a `moduleManifest` consumed by the container and a typed service class. Modules depend on `@integrax/entities` for canonical types.
