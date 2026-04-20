# @integrax/connector-mercadopago

Connector for MercadoPago. Handles payment creation, status queries, refunds, and webhook signature validation.

**Auth:** `access_token` (Bearer).

**Actions:** create preference, get payment, refund payment, list payments.

**Webhooks:** `webhooks.ts` exports `validateMercadoPagoSignature` and `parseMercadoPagoEvent`.

**Exports:** `MercadoPagoConnector`, shared types, webhook utilities.

**Dependencies:** `@integrax/connector-sdk`.

**Consumers:** `modules/payments`, `services/control-plane` tester registry, `packages/webhook-ingestion`.
