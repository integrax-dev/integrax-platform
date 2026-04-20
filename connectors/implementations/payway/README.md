# @integrax/connector-payway

Connector for Payway (Prisma Medios de Pago). Scaffold implementation — verify endpoint paths against Payway's official integration guide before production use.

**Auth:** `site_id` + `api_key` in request body; `public_key` for Payway.js client-side tokenization.

**Environments:** sandbox (`developers.payway.com.ar`) and production (`pos.payway.com.ar`).

**Actions:** create payment, get payment, refund, tokenize card.

**Consumers:** `modules/payments`.
