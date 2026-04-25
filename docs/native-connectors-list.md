# IntegraX Native Connectors Catalog

Generated from `connectors/implementations` on 2026-04-21.

Total native connector implementations: **9**.

## Native Implementations

| Connector ID | Product / Service | Domain | Current Meaning |
|---|---|---|---|
| `afip-wsfe` | AFIP WSFE | Billing / Tax | Native connector for Argentine electronic invoicing through AFIP Web Service Factura Electrónica. |
| `contabilium` | Contabilium | ERP / Accounting | Native connector for accounting, ERP, billing, customers, products, and business records. |
| `decidir` | Decidir / Prisma | Payments | Native connector for card/payment processing through Decidir. |
| `email` | Email / SMTP | Messaging | Native connector for transactional email delivery through SMTP-style configuration. |
| `google-sheets` | Google Sheets | Sheets / Data Ops | Native connector for spreadsheet-based reads, writes, exports, syncs, or operational reporting. |
| `mercadopago` | MercadoPago | Payments | Native connector for LatAm payments, checkout, payment status, refunds, and related payment operations. |
| `mobbex` | Mobbex | Payments | Native connector for payment operations through Mobbex. |
| `payway` | Payway | Payments | Native connector for card/payment processing through Payway. |
| `whatsapp` | WhatsApp Business | Messaging | Native connector for WhatsApp Business messaging, notifications, and customer communication. |

## Native Connectors By Functional Area

### Payments

- `mercadopago`
- `decidir`
- `mobbex`
- `payway`

### Billing / Tax / Accounting

- `afip-wsfe`
- `contabilium`

### Messaging

- `whatsapp`
- `email`

### Data / Sheets

- `google-sheets`

## Admin Panel Catalog Difference

The current Admin Panel connector UI also shows a catalog entry for `tiendanube`.

| Connector ID | Product / Service | Status In This Repo |
|---|---|---|
| `tiendanube` | Tienda Nube | Appears in the Admin Panel catalog, but does **not** currently exist as a native implementation under `connectors/implementations`. |

## Dashboard Workflow Catalog Difference

The Dashboard workflow catalog also references services that are useful for UI/design and workflow-builder planning, but are not all native connector implementations in this repo.

| Catalog ID | Product / Service | Relationship To Native Connectors |
|---|---|---|
| `mercadolibre` | MercadoLibre | Dashboard/workflow catalog entry; no native implementation found under `connectors/implementations`. |
| `shopify` | Shopify | Dashboard/workflow catalog entry; no native implementation found under `connectors/implementations`. |
| `afip` | AFIP | Catalog alias/concept; native implementation is `afip-wsfe`. |
| `mercadopago` | MercadoPago | Matches native implementation `mercadopago`. |
| `tiendanube` | Tiendanube | Catalog/UI entry; no native implementation found under `connectors/implementations`. |
| `contabilium` | Contabilium | Matches native implementation `contabilium`. |
| `sheets` | Google Sheets | Catalog alias/concept; native implementation is `google-sheets`. |
| `whatsapp` | WhatsApp Business | Matches native implementation `whatsapp`. |
| `integrax` | IntegraX Logic | Internal workflow logic/service node, not an external native connector implementation. |

## Design Implication

For Admin Panel UI design, the clean split should be:

- **Implemented native connectors:** show as installable/configurable real connectors.
- **Catalog/planned connectors:** show as planned, requestable, or learnable connectors.
- **Activepieces connectors:** show as external automation pieces, separate from IntegraX-native connectors.
- **IntegraX logic nodes:** show inside workflow-builder logic, not in the same mental bucket as external connectors.

