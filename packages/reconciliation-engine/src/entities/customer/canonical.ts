/**
 * Canonical Customer — the shared representation used by the reconciliation engine.
 * Every connector adapter maps its native customer/contact type to this shape.
 */

export interface CanonicalCustomer {
  /** All external IDs this customer has across systems */
  externalIds: Array<{ system: string; id: string }>;
  /** Primary fiscal identifier (CUIT/AR, CPF/CNPJ/BR, EIN/US, RFC/MX, etc.) */
  taxId: string;
  /** Legal / registered name */
  name: string;
  /** Trade name / DBA */
  fantasyName?: string;
  email?: string;
  phone?: string;
  address?: string;
  /**
   * Fiscal / VAT category (CondicionIVA in AR, Regime in BR, etc.).
   * Mismatch is BLOCK-level: wrong category produces wrong invoice types.
   */
  vatStatus?: string;
  status: 'active' | 'inactive';
  updatedAt: Date;
  sourceSystem: string;
}
