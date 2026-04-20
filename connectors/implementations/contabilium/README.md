# @integrax/connector-contabilium

Connector for Contabilium ERP, widely used by Argentine SMEs. Manages customers, products, invoices (comprobantes), and payments.

**Auth:** OAuth2 client credentials (clientId + clientSecret → access token).

**Actions:** create/get customer, create/get product, create comprobante, get payment status.

**Dependencies:** `@integrax/connector-sdk`, `HttpClient` for token refresh.

**Consumers:** `modules/billing`, `modules/catalog`, `services/control-plane` tester registry.
