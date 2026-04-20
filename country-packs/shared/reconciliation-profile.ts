/**
 * ReconciliationProfile — per-country translation layer for the reconciliation engine.
 *
 * The reconciliation engine is deterministic and must stay so (audit requirements).
 * This profile sits on top and translates country-specific concepts to the engine's
 * canonical field names, without touching the engine itself.
 */

export interface InvoiceTypeInfo {
  code: string | number;
  name: string;
  requiresFiscalAuth: boolean;
}

export interface ReconciliationProfile {
  /** ISO 3166-1 alpha-2 country code */
  countryCode: string;

  /** Human-readable label */
  countryName: string;

  /** Tax ID field names used in this country's systems */
  taxIdFields: string[];

  /**
   * Fiscal authorization code field.
   * AR: 'cae' | BR: 'chaveAcesso' | MX: 'folioFiscal' | null = not applicable
   */
  fiscalAuthCodeField: string | null;

  /** Invoice type registry — maps local codes to canonical info */
  invoiceTypes: Record<string | number, InvoiceTypeInfo>;

  /** VAT/tax status categories used in this country */
  vatStatuses: Record<string, string>;

  /**
   * Normalize a raw tax ID string to its canonical form for comparison.
   * Default: strip non-alphanumeric chars and uppercase.
   */
  normalizeTaxId(raw: string): string;

  /**
   * Returns true if the given invoice type code is valid for this country.
   */
  isValidInvoiceType(type: string | number): boolean;

  /**
   * Returns the canonical name for a given VAT status key.
   * Returns the input unchanged if not recognized.
   */
  vatStatusLabel(key: string): string;
}
