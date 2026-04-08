// --- CUIT / CUIL ------------------------------------------------------------
export { normalizeCuit, validateCuit, formatCuit } from './cuit.js';

// --- CAE --------------------------------------------------------------------
export {
  normalizeCae,
  isValidCaeFormat,
  isCaeExpired,
  validateCaeExpiry,
} from './cae.js';

// --- Tipos de comprobante AFIP ----------------------------------------------
export {
  AR_INVOICE_TYPES,
  validateAfipInvoiceType,
  getAfipInvoiceTypeName,
  requiresCae,
} from './invoice-types.js';
export type { AfipInvoiceTypeInfo } from './invoice-types.js';
