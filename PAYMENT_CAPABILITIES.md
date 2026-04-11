# Payment Capabilities

`PaymentCapability` is a discriminated union of granular payment operations declared on a connector manifest.
The operation-engine Validator checks `capabilityMap` before dispatching any payment command.

---

## Capability reference

| Capability | Description | MercadoPago |
|---|---|---|
| `create_payment` | Create a new payment intent / charge | ✓ |
| `authorize_payment` | Pre-authorize without capturing | ✓ |
| `capture_payment` | Capture a previously authorized payment | ✓ |
| `refund_payment` | Issue a full or partial refund | ✓ |
| `cancel_payment` | Cancel a pending or authorized payment | ✓ |
| `tokenize_payment_method` | Tokenize a card or payment method for reuse | ✓ |
| `create_subscription` | Create a recurring billing subscription | ✓ |
| `cancel_subscription` | Cancel an active subscription | ✓ |
| `pause_subscription` | Pause without cancelling | — |
| `create_checkout_link` | Generate a hosted checkout URL | ✓ (preference) |
| `generate_qr_payment` | Generate a QR code for in-person payment | ✓ (Cobros con QR) |
| `reconcile_payment` | Compare local record against PSP live state | ✓ |
| `get_payment_status` | Fetch current status from PSP | ✓ |

---

## How capabilities are declared

```typescript
// connectors/implementations/mercadopago/connector.manifest.ts
const manifest = {
  capabilities: ['read', 'write', 'webhook_inbound', 'polling', 'payments'] as const,
  payment_capabilities: [
    'create_payment',
    'capture_payment',
    'refund_payment',
    // ...
  ] as const,
} satisfies ConnectorManifest;
```

The `'payments'` entry in `capabilities` signals that the connector participates in the payment capability model.
`payment_capabilities` then enumerates the specific operations it supports.

---

## How capabilities are validated

`packages/operation-engine/src/core/capability.ts` maps command names to `OperationCapability` values.
Payment commands map to their corresponding `PaymentCapability` values via `inferCapability()`.

`services/control-plane/src/platform/container/engine.ts` wires the per-connector capability map:
```typescript
const operationValidator = new Validator({
  capabilityMap: {
    mercadopago: ['create_record', 'update_record', 'sync_record',
                  'create_payment', 'capture_payment', 'refund_payment', ...],
    // ...
  },
});
```

If a tenant tries to dispatch a payment command to a connector that doesn't declare the capability, the operation fails at the validation stage (before any facade call).

---

## Adding a capability to an existing connector

1. Add the capability string to `payment_capabilities` in the connector manifest.
2. Add the corresponding `OperationCapability` value to the connector's entry in `capabilityMap` in `engine.ts`.
3. Implement the facade method.
4. Write a test for the new operation in the connector's test suite.
