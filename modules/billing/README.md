# @integrax/module-billing

Invoice generation, CAE authorization tracking, and payment status for Argentine electronic invoicing.

**Exports:** `BillingService`, `moduleManifest`, types: `CreateInvoiceInput`, `AuthorizeCaeInput`, `VoidInvoiceInput`, `CompareInvoicesInput`, `InvoiceComparisonResult`.

**Key operations:** create invoice, authorize CAE (delegates to `afip-wsfe` connector), void invoice, compare invoices across systems.

**Consumers:** `services/control-plane` (via platform container), `profiles/ecommerce`, `workflows/temporal` (OrderWorkflow invoice step).
