/**
 * Canonical Invoice — the shared representation used by the reconciliation engine.
 *
 * An invoice is immutable once authorized. Conflicts here are mostly discovered
 * when comparing an ERP comprobante with its fiscal-authority counterpart,
 * or cross-tenant between ERP and payment systems.
 */

export interface CanonicalInvoice {
  /** All external IDs across systems */
  externalIds: Array<{ system: string; id: string }>;
  /** Human-readable invoice number, e.g. "0001-00000042" */
  invoiceNumber: string;
  /** Document type code (connector-specific, e.g. AFIP comprobante type, UBL invoice type) */
  invoiceType: number | string;
  /** Customer fiscal identifier (CUIT, CNPJ, EIN, etc.) */
  customerTaxId: string;
  /** Customer name on the invoice */
  customerName: string;
  /** Net amount (pre-tax) */
  amountNet: number;
  /** Tax amount */
  amountTax: number;
  /** Total including taxes */
  amountTotal: number;
  currency: string;               // ISO 4217
  /**
   * Fiscal authorization code issued by a government authority.
   * AR: CAE (AFIP). BR: chaveAcesso (SEFAZ). Optional — not all invoice types require it.
   */
  authorizationCode?: string;
  authorizationExpiry?: Date;
  /** Invoice lifecycle status */
  status: 'draft' | 'authorized' | 'voided';
  issuedAt: Date;
  updatedAt: Date;
  sourceSystem: string;
}
