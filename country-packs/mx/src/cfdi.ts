/** CFDI — Comprobante Fiscal Digital por Internet (Mexico fiscal invoice) */

export interface CfdiTypeInfo {
  code: string;
  name: string;
  requiresAuthorization: boolean;
}

export const MX_CFDI_TYPES: Record<string, CfdiTypeInfo> = {
  I: { code: 'I', name: 'Ingreso',          requiresAuthorization: true },
  E: { code: 'E', name: 'Egreso',           requiresAuthorization: true },
  T: { code: 'T', name: 'Traslado',         requiresAuthorization: true },
  N: { code: 'N', name: 'Nómina',           requiresAuthorization: true },
  P: { code: 'P', name: 'Pago',             requiresAuthorization: true },
};

export const MX_TAX_REGIMES: Record<string, string> = {
  '601': 'General de Ley Personas Morales',
  '603': 'Personas Morales con Fines no Lucrativos',
  '605': 'Sueldos y Salarios e Ingresos Asimilados a Salarios',
  '606': 'Arrendamiento',
  '612': 'Personas Físicas con Actividades Empresariales y Profesionales',
  '614': 'Ingresos por Intereses',
  '616': 'Sin obligaciones fiscales',
  '621': 'Incorporación Fiscal (RIF)',
  '622': 'Actividades Agrícolas, Ganaderas, Silvícolas y Pesqueras',
  '625': 'Régimen de las Actividades Empresariales con ingresos a través de Plataformas Tecnológicas',
  '626': 'Régimen Simplificado de Confianza (RESICO)',
};

export function isValidCfdiType(code: string): boolean {
  return code.toUpperCase() in MX_CFDI_TYPES;
}

export function getCfdiTypeName(code: string): string | undefined {
  return MX_CFDI_TYPES[code.toUpperCase()]?.name;
}
