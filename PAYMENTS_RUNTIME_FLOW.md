# Payments Runtime Flow

How a payment operation travels from API call to final state.

---

## Write path (mutation commands)

```
POST /api/operations
  body: { connectorId: 'mercadopago', command: 'create_payment', payload: {...}, tenantId }

  ↓ OperationEngine.submit()
    ↓ Validator.check()
        — capability check: mercadopago has 'create_payment' in capabilityMap
        — permission check: tenant has connector configured
        — state check: no duplicate via idempotencyStore
    ↓ ApprovalPolicy.evaluate()  (skip if no approval rule)
    ↓ Planner.plan()
    ↓ Executor.execute()
        → FacadeResolver.resolve('mercadopago', tenantId)
            → loads credentials from tenant_connectors table
            → returns MercadoPagoFacade
        → facade.execute('create_payment', payload)
            → MercadoPago API call
            → returns { id, status, ... }
    ↓ SnapshotUpdater.update()   → stores canonical Payment in snapshot_store
    ↓ EventPublisher.publish()   → emits 'payment.initiated' on event-bus
    ↓ TimelineWriter.write()     → appends sync trace to timeline
    ↓ AttemptStore.record()      → records attempt duration/result

  returns OperationResult { operationId, status, result }
```

---

## Module write path (after facade execution)

The dispatcher in `container/engine.ts` calls `paymentsService.*` methods after the facade returns:

```
facade.execute('create_payment', payload)
  → result: { id: 'mp_123', status: 'pending', amount: 1500, ... }

dispatcher.moduleHandlers.payments('create_payment', payload)
  → paymentsService.createPayment(input, 'mp_123', 'pending')
      → PaymentService.createPaymentRecord()
          → stores canonical Payment in snapshot_store
          → emits 'payment.initiated'
          → writes timeline entry
```

---

## Read path (queries)

```
GET /api/snapshots?tenantId=T&entityType=payment&canonicalId=P

  ↓ snapshotStore.get(tenantId, 'payment', canonicalId)
  ← EntitySnapshot { payload: Payment, payloadHash, updatedAtSnapshot }

# or directly:
paymentsService.getPayment(tenantId, paymentId)
  → snapshotStore.get(tenantId, 'payment', paymentId)
```

Read operations bypass the operation-engine entirely.

---

## Ingest path (webhook/polling → module)

```
POST /webhooks/<connectorId>
  body: raw webhook payload from PSP

  ↓ WebhookIngestion.validateSignature()  (HMAC-SHA256)
  ↓ WebhookIngestion.normalizePayload()
  ↓ EventBus.publish({ type: 'webhook.received', ... })

  ↓ IntegrationOrchestrator (subscribed to 'webhook.received')
      → ConnectorManifestRegistry.getManifest('mercadopago')
      → Canonicalizer.canonicalize(rawPayload, manifest.entities.payment)
          → maps: id→externalId, transaction_amount→amount, status→status, ...
      → SnapshotWriter.upsert()
      → EventPublisher.publish('payment.updated')
      → TimelineWriter.write()

  ↓ PaymentsService subscribed to 'payment.updated'
      → ingestPayment(tenantId, canonicalPayload)
          → reconcile against live PSP state if needed
```

---

## Event flow

```
payment.initiated     → triggered on createPayment()
payment.authorized    → triggered on authorizePayment()
payment.captured      → triggered on capturePayment()
payment.failed        → triggered on failed operation attempt
payment.cancelled     → triggered on cancelPayment()
payment.refunded      → triggered on refundPayment() (full)
payment.partially_refunded → triggered on partial refund
payment.reconciliation_failed → triggered by ReconciliationService on drift detection
subscription.created  → triggered on createSubscription()
subscription.cancelled → triggered on cancelSubscription()
```

All events follow the `IntegraxEvent<T>` envelope: `{ id, type, tenantId, sourceSystem, entityType, entityId, payload, occurredAt }`.

---

## Billing integration point

A workflow step can trigger invoice creation after a payment is captured:

```
payment.captured event
  → workflow: 'payment-captured-invoice'
      → billingService.createInvoice({
          tenantId,
          customerId: payment.payerId,
          amount: payment.amount,
          currency: payment.currency,
          paymentId: payment.id,
        })
```

The billing module and payments module do not import each other. The workflow is the integration point.
