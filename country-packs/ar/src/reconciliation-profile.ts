import type { ReconciliationProfile } from '../../shared/reconciliation-profile.js';
import { normalizeCuit } from './cuit.js';
import { AR_INVOICE_TYPES } from './invoice-types.js';

const VAT_STATUSES: Record<string, string> = {
  ResponsableInscripto: 'Responsable Inscripto',
  Monotributista:       'Monotributista',
  ExentoIVA:            'Exento IVA',
  ConsumidorFinal:      'Consumidor Final',
  NoAlcanzado:          'No Alcanzado',
  SujetoNoCategorizado: 'Sujeto No Categorizado',
};

export const AR_RECONCILIATION_PROFILE: ReconciliationProfile = {
  countryCode: 'AR',
  countryName: 'Argentina',

  taxIdFields: ['cuit', 'cuil', 'nro_cuit', 'numero_cuit', 'cuit_cuil', 'tax_id', 'fiscal_id'],

  fiscalAuthCodeField: 'cae',

  invoiceTypes: Object.fromEntries(
    Object.entries(AR_INVOICE_TYPES).map(([code, info]) => [
      code,
      { code: Number(code), name: info.name, requiresFiscalAuth: info.requiresCae },
    ]),
  ),

  vatStatuses: VAT_STATUSES,

  normalizeTaxId: (raw) => normalizeCuit(raw),

  isValidInvoiceType: (type) => String(type) in AR_INVOICE_TYPES || Number(type) in AR_INVOICE_TYPES,

  vatStatusLabel: (key) => VAT_STATUSES[key] ?? key,
};
