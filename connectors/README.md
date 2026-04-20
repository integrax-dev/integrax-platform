# connectors/

All connector code lives here: the shared SDK and per-integration implementations.

```
connectors/
  sdk/typescript/           @integrax/connector-sdk — base types, errors, HTTP, auth, idempotency, observability
  implementations/
    afip-wsfe/              @integrax/connector-afip-wsfe — AFIP WSFE electronic invoicing (CAE)
    contabilium/            @integrax/connector-contabilium — Contabilium ERP (AR PyMEs)
    decidir/                @integrax/connector-decidir — Decidir / ICBC payment gateway
    email/                  @integrax/connector-email — SMTP / transactional email
    google-sheets/          @integrax/connector-google-sheets — Google Sheets read/write
    mercadopago/            @integrax/connector-mercadopago — MercadoPago payments + webhooks
    mobbex/                 @integrax/connector-mobbex — Mobbex payment gateway
    payway/                 @integrax/connector-payway — Payway (Prisma) payment gateway
    whatsapp/               @integrax/connector-whatsapp — WhatsApp Business Cloud API
```

Every implementation extends `BaseConnector` from the SDK. To add a new connector, see `sdk/typescript/README.md`.
