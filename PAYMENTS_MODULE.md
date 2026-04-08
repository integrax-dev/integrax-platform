# Payments Module

`@integrax/module-payments` is the provider-neutral payment capability layer of IntegraX.
It stores canonical payment entities, emits typed events, and exposes a stable API that the operation-engine dispatcher calls after executing PSP-specific facades.

---

## Principles

- **No PSP coupling in core.** The module never imports MercadoPago, Stripe, or any connector.
  PSP-specific logic lives in connector facades and manifests.
- **Write path goes through the operation-engine.** Mutation commands (`create_payment`, `capture_payment`, etc.)
  must be dispatched via `OperationEngine`, which runs the facade and then calls the module to persist results.
- **Query path is direct.** Read-only methods (`getPayment`, `listPayments`, etc.) are callable directly on `PaymentsService`.
- **Canonical entities only.** The module stores `Payment`, `PaymentMethod`, `Subscription`, and `Refund` — not PSP-native objects.

---

## Architecture

```
OperationEngine
  └─ dispatcher.payments.*
       └─ PaymentsService           ← top-level façade
            ├─ PaymentService       ← CRUD + status transitions
            ├─ PaymentMethodService ← tokenized methods
            ├─ SubscriptionService  ← recurring billing
            ├─ ReminderService      ← payment reminders
            └─ ReconciliationService ← cross-system drift detection
```

`PaymentsService` reads from and writes to `SnapshotStore` (keyed by `entityType: 'payment' | 'payment_method' | 'subscription' | 'refund'`).
Events are published to `EventBus`. Timeline entries are written to `TimelineStore`.

---

## Dispatcher methods (called by operation-engine)

| Method | Trigger |
|---|---|
| `createPayment(input, externalId, initialStatus)` | PSP returned a new payment |
| `authorizePayment({ paymentId, authorizedAt })` | PSP authorized (pre-auth flow) |
| `capturePayment({ paymentId, capturedAt, amount })` | PSP capture confirmed |
| `refundPayment(input, externalRefundId)` | PSP refund created |
| `cancelPayment({ paymentId, cancelledAt, reason })` | PSP cancellation confirmed |
| `tokenizePaymentMethod(input, pspToken, details)` | Card/method tokenized |
| `createSubscription(input, externalId)` | PSP subscription created |
| `cancelSubscription({ subscriptionId, cancelledAt, reason })` | PSP subscription cancelled |
| `reconcilePayment(input, livePayment)` | Triggered by polling or webhook diff |

---

## Operations that return PSP data (use facade directly)

`create_checkout_link` and `generate_qr_payment` return PSP-generated URLs/QR data.
These are **not persisted in the module** — callers must go through the operation-engine to get the facade result directly.
Calling these on `PaymentsService` throws a descriptive error pointing to the correct path.

---

## Ingest methods (called by webhook/polling pipeline)

`ingestPayment`, `ingestPaymentMethod`, `ingestSubscription` accept raw PSP payloads mapped by the connector's entity mapping.
They upsert the snapshot and emit the appropriate event based on status.

---

## Module manifest

```typescript
// modules/payments/src/module.manifest.ts
export const moduleManifest = {
  id: 'payments',
  version: '0.1.0',
  dependsOn: ['@integrax/entities', '@integrax/event-bus', '@integrax/snapshot-store', '@integrax/timeline'],
  emittedEvents: [ /* 20 payment.* / subscription.* event types */ ],
  paymentCapabilities: [ /* mirrors PaymentCapability union */ ],
  usedByProfiles: ['ecommerce'],
};
```

---

## Adding a new PSP connector with payment support

1. Add `'payments'` to `capabilities` in the connector manifest.
2. Declare the supported `payment_capabilities` array.
3. Add entity mappings for `payment`, `subscription`, `refund` as needed.
4. Implement the facade methods that correspond to each declared capability.
5. The operation-engine Validator reads `capabilityMap` — update it in `container/engine.ts`.

No changes to `modules/payments` are needed.
