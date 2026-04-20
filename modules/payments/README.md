# @integrax/module-payments

PSP-neutral payment capability layer. Abstracts MercadoPago, Decidir, Payway, Mobbex, and future providers behind a single interface.

**Exports:** `PaymentsService`, `PaymentService`, `PaymentMethodService`, `SubscriptionService`, `ReminderService`, `PaymentReconciliationService`, `moduleManifest`.

**Key operations:** create/authorize/capture/refund/cancel payment, tokenize payment method, create/cancel subscription, generate checkout link, generate QR payment, send payment reminder, reconcile payments.

**Consumers:** `services/control-plane` (platform routes), `profiles/ecommerce`, `workflows/temporal` (PaymentWorkflow), `modules/billing`.
