# Payment Events

All payment events are published to `EventBus` by `modules/payments`.
They follow the `IntegraxEvent<T>` envelope with `entityType` set to `'payment'`, `'subscription'`, or `'refund'`.

---

## Payment events (`payment.*`)

| Event type | Emitted when | Key payload fields |
|---|---|---|
| `payment.initiated` | A new payment record is created (status: pending/processing) | `paymentId`, `amount`, `currency`, `provider` |
| `payment.authorized` | Payment pre-authorized (not yet captured) | `paymentId`, `authorizedAt` |
| `payment.captured` | Payment captured / confirmed | `paymentId`, `capturedAt`, `amount` |
| `payment.failed` | Payment declined or errored | `paymentId`, `failureCode`, `failureMessage` |
| `payment.cancelled` | Payment cancelled before capture | `paymentId`, `cancelledAt`, `reason` |
| `payment.refunded` | Full or partial refund created | `paymentId`, `refundId`, `amount` |
| `payment.partially_refunded` | Partial refund on a captured payment | `paymentId`, `refundId`, `amount`, `remaining` |
| `payment.disputed` | Chargeback or dispute opened | `paymentId`, `disputeId` |
| `payment.expired` | Payment window expired without completion | `paymentId`, `expiredAt` |
| `payment.reconciliation_failed` | Drift detected between local record and PSP | `paymentId`, `conflicts[]` |
| `payment.reminder.sent` | Reminder notification sent for a pending payment | `paymentId`, `channel`, `recipientId` |
| `payment.checkout_link_created` | Hosted checkout URL generated | `paymentId`, `checkoutUrl`, `expiresAt` |
| `payment.qr_generated` | QR code created for in-person payment | `paymentId`, `qrData` |

---

## Subscription events (`subscription.*`)

| Event type | Emitted when | Key payload fields |
|---|---|---|
| `subscription.created` | New subscription activated | `subscriptionId`, `planId`, `amount`, `frequency` |
| `subscription.activated` | Subscription transitions to active after trial/pending | `subscriptionId`, `activatedAt` |
| `subscription.renewed` | Billing cycle completed, next period started | `subscriptionId`, `renewedAt`, `nextBillingAt` |
| `subscription.paused` | Subscription temporarily paused | `subscriptionId`, `pausedAt` |
| `subscription.cancelled` | Subscription cancelled | `subscriptionId`, `cancelledAt`, `reason` |
| `subscription.payment_failed` | A subscription billing attempt failed | `subscriptionId`, `failedAt`, `retryAt` |

---

## Envelope shape

```typescript
interface IntegraxEvent<T> {
  id: string;           // ulid
  type: IntegraxEventType;
  tenantId: string;
  sourceSystem: string; // e.g. 'mercadopago'
  entityType: string;   // 'payment' | 'subscription' | 'refund'
  entityId?: string;    // canonical payment/subscription id
  payload: T;
  occurredAt: Date;
  correlationId?: string;
}
```

---

## Subscribing to payment events

```typescript
import { eventBus } from './container/event-bus.js';

eventBus.subscribe('payment.captured', async (event) => {
  const { paymentId, amount, currency } = event.payload as { paymentId: string; amount: number; currency: string };
  // trigger fulfillment, invoice generation, etc.
});

// Multiple types
eventBus.subscribe(['payment.failed', 'subscription.payment_failed'], async (event) => {
  // alert operator
});
```

---

## Reconciliation conflict shape (`payment.reconciliation_failed`)

```typescript
interface ReconciliationConflict {
  field: string;          // e.g. 'status', 'amount', 'refundTotal'
  localValue: unknown;
  liveValue: unknown;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}

// payload
{
  paymentId: string;
  provider: string;
  conflicts: ReconciliationConflict[];
  detectedAt: Date;
}
```
