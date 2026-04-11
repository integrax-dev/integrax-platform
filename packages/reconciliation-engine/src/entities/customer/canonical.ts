/**
 * Canonical Customer — the shared representation used by the reconciliation engine.
 * Every connector adapter maps its native customer/contact type to this shape.
 */

export interface CanonicalCustomer {
  /** All external IDs this customer has across systems */
  externalIds: Array<{ system: string; id: string }>;
  /**
   * Primary fiscal identifier — CUIT/CUIL (AR), CPF/CNPJ (BR), EIN (US), etc.
   * The strongest identity signal across Argentine systems.
   */
  taxId: string;
  /** RazonSocial / full legal name */
  name: string;
  /** NombreFantasia / trade name */
  fantasyName?: string;
  email?: string;
  phone?: string;
  address?: string;
  /**
   * Fiscal / VAT category — CondicionIVA in Argentina.
   * Mismatch here is BLOCK-level: wrong category produces wrong invoice types.
   */
  vatStatus?: string;
  status: 'active' | 'inactive';
  updatedAt: Date;
  sourceSystem: string;
}
