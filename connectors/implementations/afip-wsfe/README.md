# @integrax/connector-afip-wsfe

Connector for AFIP WSFE (Web Service de Factura Electrónica). Authorizes electronic invoices and obtains the CAE (Código de Autorización Electrónico).

**Auth:** Digital certificate issued by AFIP (PEM format) + CUIT.

**Actions:** authorize comprobante (Factura A/B/C, Nota de Crédito/Débito), query CAE status, get last authorized comprobante number.

**Dependencies:** `@integrax/connector-sdk`, `node-forge` (certificate parsing), `fast-xml-parser` (SOAP).

**Consumers:** `modules/billing` (CAE authorization flow), `workflows/temporal` (OrderWorkflow → invoice step).
