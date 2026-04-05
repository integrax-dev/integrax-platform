/**
 * Canonical Invoice — the shared representation used by the reconciliation engine.
 *
 * An invoice is immutable once authorized (CAE issued). Conflicts here are
 * mostly discovered when comparing a Contabilium comprobante with its AFIP
 * counterpart, or cross-tenant between ERP and payment systems.
 */

export interface CanonicalInvoice {
  /** All external IDs across systems — including CAE, internal ERP id, etc. */
  externalIds: Array<{ system: string; id: string }>;
  /**
   * Human-readable invoice number, e.g. "0001-00000042".
   * Composed from PuntoVenta + CbteDesde in Argentina.
   */
  invoiceNumber: string;
  /**
   * Comprobante type code (AFIP).
   * 1=FacturaA, 6=FacturaB, 11=FacturaC, 3=NotaCreditoA, etc.
   */
  invoiceType: number | string;
  /** Customer taxId (CUIT) */
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
  /** AFIP Código de Autorización Electrónico */
  cae?: string;
  caeExpiryDate?: Date;
  /**
   * Invoice status.
   * 'authorized' = CAE issued. 'draft' = not yet sent to AFIP. 'voided' = anulado.
   */
  status: 'draft' | 'authorized' | 'voided';
  issuedAt: Date;
  updatedAt: Date;
  sourceSystem: string;
}
