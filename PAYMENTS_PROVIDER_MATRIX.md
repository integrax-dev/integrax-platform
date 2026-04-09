# Payment Provider Matrix

The authoritative capability matrix lives in code: `packages/entities/src/payment-provider-matrix.ts`.

This document explains the model and how to use it.

---

## Capability statuses

| Status | Meaning |
|---|---|
| `full` | Implemented, tested, production-ready |
| `partial` | Implemented with known limitations (see `note` field) |
| `unsupported` | PSP does not support this operation |
| `unknown` | Not yet researched |

**Rule:** Only mark `full` when the connector facade + tests exist. Never fake support.

---

## Tier 1 — LatAm core (AR)

| Capability | MercadoPago | Payway | Mobbex | Decidir |
|---|---|---|---|---|
| create_payment | full | partial | partial | partial |
| authorize_payment | full | partial | — | partial |
| capture_payment | full | partial | — | partial |
| refund_payment | full | partial | partial | partial |
| cancel_payment | full | partial | partial | partial |
| tokenize_payment_method | full | partial | — | partial |
| create_subscription | full | — | partial | — |
| cancel_subscription | full | — | partial | — |
| create_checkout_link | full | unknown | partial | unknown |
| generate_qr_payment | full | — | — | — |
| create_split_payment | partial | — | partial | — |
| reconcile_payment | full | unknown | partial | unknown |
| send_payment_reminder | partial | — | — | — |

`full` = facade + tests implemented. `partial` = scaffold only. `—` = unsupported. `unknown` = not yet researched.

---

## Tier 2

| Provider | Region | Status |
|---|---|---|
| Getnet (Santander) | AR, BR | All capabilities: unknown — connector not yet scaffolded |
| Fiserv | AR, US, LATAM | All capabilities: unknown |
| PayU | AR, CO, MX, BR, PE, CL | All capabilities: unknown |

---

## Tier 3

| Provider | Region | Notable |
|---|---|---|
| dLocal | Global emerging markets | Unknown — cross-border specialist |
| PayPal | Global | Unknown — subscription + marketplace API available |
| Stripe | Global | Unknown — Connect for split, Checkout Sessions for links |
| Wibond | AR | BNPL only — no auth/capture/subscription |
| Addi | CO, MX, BR | BNPL only |

---

## How to query in code

```typescript
import {
  PAYMENT_PROVIDER_MATRIX,
  getProvidersForCapability,
  getCapabilityStatus,
} from '@integrax/entities';

// Which providers support create_checkout_link at least partially?
const providers = getProvidersForCapability('create_checkout_link', 'partial');
// → [mercadopago, mobbex]

// What's the status of QR payment for mercadopago?
const status = getCapabilityStatus('mercadopago', 'generate_qr_payment');
// → { status: 'full' }
```

---

## How to add a new provider

1. Add an entry to `PAYMENT_PROVIDER_MATRIX` in `packages/entities/src/payment-provider-matrix.ts`
2. Set all capabilities to `'unknown'` initially
3. Scaffold the connector under `connectors/implementations/<provider>/`
4. Implement each capability, promote from `unknown` → `partial` → `full` as you go
5. Register the facade in `services/control-plane/src/platform/container/connectors.ts`
6. Add the provider's capabilities to `capabilityMap` in `container/engine.ts`
