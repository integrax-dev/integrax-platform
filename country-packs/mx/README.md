# country-packs/ar

Lógica específica de Argentina. Nada del core depende de esto.

- `cuit.ts` — normalización y validación de CUIT (checksum)
- `cae.ts` — normalización de CAE, validación de vencimiento
- `invoice-types.ts` — tipos válidos de comprobantes AFIP (1, 6, 11, 19, 51...)

Exporta: `normalizeCuit`, `validateCuit`, `normalizeCae`, `validateCaeExpiry`, `validateAfipInvoiceType`, `AR_INVOICE_TYPES`.
