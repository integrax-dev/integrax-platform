import type {
  BusinessTypeProvider,
  BusinessTypeWeightMap,
} from './types.js';

function isLatLon(value: string): boolean {
  const match = value.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
  if (!match) return false;
  const lat = Number(match[1]);
  const lon = Number(match[2]);
  return Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
}

export const defaultBusinessTypeProviders: BusinessTypeProvider[] = [
  // ── Argentina ──────────────────────────────────────────────────────────────
  // CUIT: XX-XXXXXXXX-X (11 digits with dashes)
  { id: 'ar-cuit', format: 'ar-cuit', detect: ({ value }) => /^\d{2}-\d{8}-\d{1}$/.test(value) },
  // CUIL: same format as CUIT, used for individuals
  { id: 'ar-cuil', format: 'ar-cuil', detect: ({ value, fieldPath }) => /^\d{2}-\d{8}-\d{1}$/.test(value) && /cuil/i.test(fieldPath) },

  // ── Brazil ─────────────────────────────────────────────────────────────────
  // CNPJ formatted: XX.XXX.XXX/XXXX-XX — highly distinctive, no false positives
  // CNPJ raw 14 digits: require fieldPath hint to avoid colliding with other long numbers
  { id: 'br-cnpj', format: 'br-cnpj', detect: ({ value, fieldPath }) =>
    /^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/.test(value) ||
    (/^\d{14}$/.test(value.replace(/\D/g, '')) && /cnpj|empresa|razao|razão|fiscal/i.test(fieldPath))
  },
  // CPF: XXX.XXX.XXX-XX (individuals)
  { id: 'br-cpf', format: 'br-cpf', detect: ({ value }) => /^\d{3}\.\d{3}\.\d{3}-\d{2}$/.test(value) },

  // ── Mexico ─────────────────────────────────────────────────────────────────
  // RFC: 3-4 letters + 6 digits + 3 alphanumeric (personas morales/físicas)
  { id: 'mx-rfc', format: 'mx-rfc', detect: ({ value }) => /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/i.test(value.trim()) },
  // CURP: 18-char alphanumeric (individuals)
  { id: 'mx-curp', format: 'mx-curp', detect: ({ value }) => /^[A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z0-9]\d$/i.test(value.trim()) },

  // ── Generic ────────────────────────────────────────────────────────────────
  { id: 'uuid', format: 'uuid', detect: ({ value }) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value) },
  { id: 'iso-currency', format: 'iso-currency', detect: ({ value, fieldPath }) => /^[A-Z]{3}$/.test(value.trim()) && /curr|moneda|code|iso/i.test(fieldPath) },
  { id: 'country-iso2', format: 'country-iso2', detect: ({ value, fieldPath }) => /^[A-Z]{2}$/.test(value.trim()) && /country|pais|region|code|iso/i.test(fieldPath) },
  { id: 'country-iso3', format: 'country-iso3', detect: ({ value, fieldPath }) => /^[A-Z]{3}$/.test(value.trim()) && /country|pais|region|code|iso/i.test(fieldPath) },
  { id: 'phone-e164', format: 'phone-e164', detect: ({ value }) => /^\+[1-9]\d{7,14}$/.test(value.trim()) },
  { id: 'lat-lon', format: 'lat-lon', detect: ({ value }) => isLatLon(value) },
  { id: 'date-time', format: 'date-time', detect: ({ value }) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value) },
  { id: 'date', format: 'date', detect: ({ value }) => /^\d{4}-\d{2}-\d{2}$/.test(value) },
  { id: 'email', format: 'email', detect: ({ value }) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value) },
  { id: 'uri', format: 'uri', detect: ({ value }) => /^https?:\/\//.test(value) },
];

export const defaultBusinessTypeWeights: BusinessTypeWeightMap = {
  uuid: 1.0,
  email: 1.0,
  'iso-currency': 0.95,
  'country-iso2': 0.95,
  'country-iso3': 0.95,
  'phone-e164': 0.92,
  'lat-lon': 0.95,
  // Tax IDs — same weight regardless of country
  'ar-cuit': 0.9,
  'ar-cuil': 0.9,
  'br-cnpj': 0.9,
  'br-cpf': 0.9,
  'mx-rfc': 0.9,
  'mx-curp': 0.9,
  uri: 0.9,
  'ar-money-string': 1.0,
  'date-time': 0.45,
  date: 0.35,
};

export function detectBusinessFormat(
  value: string,
  fieldPath: string,
  providers: BusinessTypeProvider[],
): string | undefined {
  for (const provider of providers) {
    if (provider.detect({ value, fieldPath })) {
      return provider.format;
    }
  }
  return undefined;
}
