/**
 * AFIP WSFE Types
 *
 * Tipos para el Web Service de Factura Electrónica de AFIP.
 * Documentación: https://www.afip.gob.ar/fe/documentos/manual_desarrollador_COMPG_v2_10.pdf
 */

import { z } from 'zod';

// ============================================
// Environments
// ============================================
export const AFIP_URLS = {
  production: {
    wsaa: 'https://wsaa.afip.gov.ar/ws/services/LoginCms',
    wsfe: 'https://servicios1.afip.gov.ar/wsfev1/service.asmx',
  },
  testing: {
    wsaa: 'https://wsaahomo.afip.gov.ar/ws/services/LoginCms',
    wsfe: 'https://wswhomo.afip.gov.ar/wsfev1/service.asmx',
  },
};

// ============================================
// Credentials
// ============================================
export interface AfipCredentials {
  cuit: string;
  certificate: string; // PEM format
  privateKey: string; // PEM format
  environment: 'production' | 'testing';
}

export interface AfipToken {
  token: string;
  sign: string;
  expirationTime: Date;
}

// ============================================
// Tipos de Comprobante AFIP
// ============================================
export const TipoComprobante = {
  FACTURA_A: 1,
  NOTA_DEBITO_A: 2,
  NOTA_CREDITO_A: 3,
  RECIBO_A: 4,
  FACTURA_B: 6,
  NOTA_DEBITO_B: 7,
  NOTA_CREDITO_B: 8,
  RECIBO_B: 9,
  FACTURA_C: 11,
  NOTA_DEBITO_C: 12,
  NOTA_CREDITO_C: 13,
  RECIBO_C: 15,
  FACTURA_E: 19, // Exportación
  NOTA_DEBITO_E: 20,
  NOTA_CREDITO_E: 21,
} as const;

export type TipoComprobanteCode = (typeof TipoComprobante)[keyof typeof TipoComprobante];

// ============================================
// Tipos de Documento
// ============================================
export const TipoDocumento = {
  CUIT: 80,
  CUIL: 86,
  CDI: 87,
  LE: 89,
  LC: 90,
  CI_EXTRANJERA: 91,
  EN_TRAMITE: 92,
  ACTA_NACIMIENTO: 93,
  PASAPORTE: 94,
  CI_BS_AS_RN: 95,
  DNI: 96,
  CONSUMIDOR_FINAL: 99, // Sin identificar
} as const;

export type TipoDocumentoCode = (typeof TipoDocumento)[keyof typeof TipoDocumento];

// ============================================
// Condición de IVA
// ============================================
export const CondicionIVA = {
  RESPONSABLE_INSCRIPTO: 1,
  RESPONSABLE_NO_INSCRIPTO: 2,
  NO_RESPONSABLE: 3,
  EXENTO: 4,
  CONSUMIDOR_FINAL: 5,
  RESPONSABLE_MONOTRIBUTO: 6,
  NO_CATEGORIZADO: 7,
  PROVEEDOR_EXTERIOR: 8,
  CLIENTE_EXTERIOR: 9,
  IVA_LIBERADO: 10,
  IVA_RI_AGENTE_PERCEPCION: 11,
  PEQUEÑO_CONTRIBUYENTE_EVENTUAL: 12,
  MONOTRIBUTISTA_SOCIAL: 13,
  PEQUEÑO_CONTRIBUYENTE_EVENTUAL_SOCIAL: 14,
} as const;

// ============================================
// Alícuotas de IVA
// ============================================
export const AlicuotaIVA = {
  NO_GRAVADO: 1,
  EXENTO: 2,
  IVA_0: 3,
  IVA_10_5: 4,
  IVA_21: 5,
  IVA_27: 6,
  IVA_5: 8,
  IVA_2_5: 9,
} as const;

export type AlicuotaIVACode = (typeof AlicuotaIVA)[keyof typeof AlicuotaIVA];

// ============================================
// Conceptos (Tipo de operación)
// ============================================
export const Concepto = {
  PRODUCTOS: 1,
  SERVICIOS: 2,
  PRODUCTOS_Y_SERVICIOS: 3,
} as const;

// ============================================
// Monedas
// ============================================
export const Moneda = {
  PESO_ARGENTINO: 'PES',
  DOLAR_ESTADOUNIDENSE: 'DOL',
  EURO: 'EUR',
  REAL: '012',
} as const;

// ============================================
// Input Schemas
// ============================================
export const IvaItemSchema = z.object({
  Id: z.number(), // AlicuotaIVA code
  BaseImp: z.number(), // Base imponible
  Importe: z.number(), // Importe IVA
});

export type IvaItem = z.infer<typeof IvaItemSchema>;

export const TributoSchema = z.object({
  Id: z.number(), // Código tributo (IIBB, etc)
  Desc: z.string(),
  BaseImp: z.number(),
  Alic: z.number(),
  Importe: z.number(),
});

export type Tributo = z.infer<typeof TributoSchema>;

export const ComprobanteAsociadoSchema = z.object({
  Tipo: z.number(),
  PtoVta: z.number(),
  Nro: z.number(),
  Cuit: z.string().optional(),
  CbteFch: z.string().optional(), // YYYYMMDD
});

export type ComprobanteAsociado = z.infer<typeof ComprobanteAsociadoSchema>;

export const FacturaRequestSchema = z.object({
  // Punto de venta
  PtoVta: z.number().min(1).max(99999),

  // Tipo de comprobante
  CbteTipo: z.number(),

  // Concepto (1=Productos, 2=Servicios, 3=Ambos)
  Concepto: z.number().min(1).max(3),

  // Documento del receptor
  DocTipo: z.number(),
  DocNro: z.string(),

  // Numeración (se obtiene del último emitido + 1)
  CbteDesde: z.number().optional(),
  CbteHasta: z.number().optional(),

  // Fechas
  CbteFch: z.string(), // YYYYMMDD
  FchServDesde: z.string().optional(), // Para servicios
  FchServHasta: z.string().optional(), // Para servicios
  FchVtoPago: z.string().optional(), // Para servicios

  // Moneda
  MonId: z.string().default('PES'),
  MonCotiz: z.number().default(1),

  // Importes
  ImpTotal: z.number(), // Total
  ImpTotConc: z.number().default(0), // No gravado
  ImpNeto: z.number(), // Neto gravado
  ImpOpEx: z.number().default(0), // Operaciones exentas
  ImpIVA: z.number(), // IVA
  ImpTrib: z.number().default(0), // Tributos

  // IVA (array de alícuotas)
  Iva: z.array(IvaItemSchema).optional(),

  // Tributos opcionales
  Tributos: z.array(TributoSchema).optional(),

  // Comprobantes asociados (para NC/ND)
  CbtesAsoc: z.array(ComprobanteAsociadoSchema).optional(),
});

export type FacturaRequest = z.infer<typeof FacturaRequestSchema>;

// ============================================
// Response Types
// ============================================
export interface FECAESolicitarResponse {
  FeCabResp: {
    Cuit: string;
    PtoVta: number;
    CbteTipo: number;
    FchProceso: string;
    CantReg: number;
    Resultado: 'A' | 'R' | 'P'; // Aprobado, Rechazado, Parcial
  };
  FeDetResp: {
    FECAEDetResponse: Array<{
      Concepto: number;
      DocTipo: number;
      DocNro: string;
      CbteDesde: number;
      CbteHasta: number;
      CbteFch: string;
      Resultado: 'A' | 'R';
      CAE?: string;
      CAEFchVto?: string;
      Observaciones?: {
        Obs: Array<{
          Code: number;
          Msg: string;
        }>;
      };
    }>;
  };
  Errors?: {
    Err: Array<{
      Code: number;
      Msg: string;
    }>;
  };
  Events?: {
    Evt: Array<{
      Code: number;
      Msg: string;
    }>;
  };
}

export interface FECompUltimoAutorizadoResponse {
  CbteNro: number;
}

export interface FEParamGetPtosVentaResponse {
  ResultGet: {
    PtoVenta: Array<{
      Nro: number;
      EmisionTipo: string;
      Bloqueado: 'S' | 'N';
      FchBaja?: string;
    }>;
  };
}

// ============================================
// CAE Result
// ============================================
export interface CAEResult {
  success: boolean;
  cae?: string;
  caeVencimiento?: string;
  cbteNro: number;
  errors?: Array<{ code: number; message: string }>;
  observations?: Array<{ code: number; message: string }>;
}

// ============================================
// Config
// ============================================
export interface AfipConfig {
  cuit: string;
  certificate: string;
  privateKey: string;
  environment: 'production' | 'testing';
  defaultPuntoVenta?: number;
}
