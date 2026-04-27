function isLatLon(value: string): boolean {
  const m = value.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
  if (!m) return false;
  const lat = Number(m[1]); const lon = Number(m[2]);
  return Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
}

export const GENERIC_BUSINESS_TYPE_PROVIDERS = [
  { id: 'uuid',         format: 'uuid',         detect: ({ value }: { value: string; fieldPath: string }) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value) },
  { id: 'iso-currency', format: 'iso-currency', detect: ({ value, fieldPath }: { value: string; fieldPath: string }) => /^[A-Z]{3}$/.test(value.trim()) && /curr|moneda|code|iso/i.test(fieldPath) },
  { id: 'country-iso2', format: 'country-iso2', detect: ({ value, fieldPath }: { value: string; fieldPath: string }) => /^[A-Z]{2}$/.test(value.trim()) && /country|pais|region|code|iso/i.test(fieldPath) },
  { id: 'country-iso3', format: 'country-iso3', detect: ({ value, fieldPath }: { value: string; fieldPath: string }) => /^[A-Z]{3}$/.test(value.trim()) && /country|pais|region|code|iso/i.test(fieldPath) },
  { id: 'phone-e164',   format: 'phone-e164',   detect: ({ value }: { value: string; fieldPath: string }) => /^\+[1-9]\d{7,14}$/.test(value.trim()) },
  { id: 'lat-lon',      format: 'lat-lon',      detect: ({ value }: { value: string; fieldPath: string }) => isLatLon(value) },
  { id: 'date-time',    format: 'date-time',    detect: ({ value }: { value: string; fieldPath: string }) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value) },
  { id: 'date',         format: 'date',         detect: ({ value }: { value: string; fieldPath: string }) => /^\d{4}-\d{2}-\d{2}$/.test(value) },
  { id: 'email',        format: 'email',        detect: ({ value }: { value: string; fieldPath: string }) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value) },
  { id: 'uri',          format: 'uri',          detect: ({ value }: { value: string; fieldPath: string }) => /^https?:\/\//.test(value) },
];

export const GENERIC_BUSINESS_TYPE_WEIGHTS: Record<string, number> = {
  uuid: 1.0, email: 1.0,
  'iso-currency': 0.95, 'country-iso2': 0.95, 'country-iso3': 0.95,
  'phone-e164': 0.92, 'lat-lon': 0.95, uri: 0.9,
  'date-time': 0.45, date: 0.35,
};
