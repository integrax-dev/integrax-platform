/** NF-e (Nota Fiscal Eletrônica) types — Brazil fiscal invoice codes */

export interface NfeTypeInfo {
  code: string;
  name: string;
  requiresAuthorization: boolean;
}

export const BR_NFE_TYPES: Record<string, NfeTypeInfo> = {
  '55': { code: '55', name: 'NF-e (Nota Fiscal Eletrônica)',         requiresAuthorization: true },
  '65': { code: '65', name: 'NFC-e (Nota Fiscal de Consumidor)',     requiresAuthorization: true },
  '57': { code: '57', name: 'CT-e (Conhecimento de Transporte)',     requiresAuthorization: true },
  '67': { code: '67', name: 'CT-e OS (Outros Serviços)',             requiresAuthorization: true },
  '58': { code: '58', name: 'MDF-e (Manifesto de Documentos Fiscais)', requiresAuthorization: true },
};

export const BR_VAT_REGIMES: Record<string, string> = {
  SimplesNacional:   'Simples Nacional',
  LucroReal:         'Lucro Real',
  LucroPresumido:    'Lucro Presumido',
  LucroArbitrado:    'Lucro Arbitrado',
  ImunidadeIsencao:  'Imunidade / Isenção',
  MEI:               'Microempreendedor Individual (MEI)',
};

export function isValidNfeType(code: string): boolean {
  return code in BR_NFE_TYPES;
}

export function getNfeTypeName(code: string): string | undefined {
  return BR_NFE_TYPES[code]?.name;
}
