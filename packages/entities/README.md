# @integrax/entities

Canonical entity type definitions — the shared language of the IntegraX platform. All services, modules, and connectors express business data in these types.

**Exports:** `Product`, `Customer`, `Invoice`, `Order`, `Stock`, `Shipment`, `Transaction`, `Payment`, `PaymentMethod`, `Subscription`, `Refund`, `ExternalId`, `ulid`, `PAYMENT_PROVIDER_MATRIX`.

No runtime logic — pure TypeScript interfaces and type utilities. The `PAYMENT_PROVIDER_MATRIX` maps each PSP to its supported capabilities and status.

**Consumers:** virtually every package in the monorepo.
