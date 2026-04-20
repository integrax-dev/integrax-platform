import type { ReconciliationProfile } from '../../shared/reconciliation-profile.js';
import { normalizeCnpj } from './cnpj.js';
import { BR_NFE_TYPES, BR_VAT_REGIMES } from './nfe.js';

export const BR_RECONCILIATION_PROFILE: ReconciliationProfile = {
  countryCode: 'BR',
  countryName: 'Brazil',

  taxIdFields: ['cnpj', 'cpf', 'cpf_cnpj', 'tax_id', 'fiscal_id', 'inscricao_estadual'],

  fiscalAuthCodeField: 'chaveAcesso',

  invoiceTypes: Object.fromEntries(
    Object.entries(BR_NFE_TYPES).map(([code, info]) => [
      code,
      { code, name: info.name, requiresFiscalAuth: info.requiresAuthorization },
    ]),
  ),

  vatStatuses: BR_VAT_REGIMES,

  normalizeTaxId: (raw) => normalizeCnpj(raw),

  isValidInvoiceType: (type) => String(type) in BR_NFE_TYPES,

  vatStatusLabel: (key) => BR_VAT_REGIMES[key] ?? key,
};
