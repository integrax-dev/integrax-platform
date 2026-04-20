import type { ReconciliationProfile } from '../../shared/reconciliation-profile.js';
import { normalizeRfc } from './rfc.js';
import { MX_CFDI_TYPES, MX_TAX_REGIMES } from './cfdi.js';

export const MX_RECONCILIATION_PROFILE: ReconciliationProfile = {
  countryCode: 'MX',
  countryName: 'Mexico',

  taxIdFields: ['rfc', 'tax_id', 'fiscal_id', 'curp', 'registro_federal'],

  // CFDI uses UUID (folio fiscal) as authorization identifier
  fiscalAuthCodeField: 'folioFiscal',

  invoiceTypes: Object.fromEntries(
    Object.entries(MX_CFDI_TYPES).map(([code, info]) => [
      code,
      { code, name: info.name, requiresFiscalAuth: info.requiresAuthorization },
    ]),
  ),

  vatStatuses: MX_TAX_REGIMES,

  normalizeTaxId: (raw) => normalizeRfc(raw),

  isValidInvoiceType: (type) => String(type).toUpperCase() in MX_CFDI_TYPES,

  vatStatusLabel: (key) => MX_TAX_REGIMES[key] ?? key,
};
