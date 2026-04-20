# @integrax/connector-decidir

Connector for Decidir (ICBC) payment gateway. Scaffold implementation — verify endpoint shapes against Decidir developer portal before production use.

**Auth:** `private_api_key` header (server-side), `public_api_key` for Decidir.js tokenization.

**Environments:** sandbox (`developers.decidir.com/api/v2`) and production (`live.decidir.com/api/v2`).

**Actions:** create payment (from Decidir.js token), get payment, refund payment.

**Consumers:** `modules/payments`.
