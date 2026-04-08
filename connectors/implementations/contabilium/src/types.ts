/**
 * Tipos de la API de Contabilium
 *
 * Contabilium es un ERP/sistema contable muy usado en Argentina para PyMEs.
 * API Docs: https://contabilium.com/api
 */

import { z } from 'zod';

type AlicuotaIVAValue = '0' | '10.5' | '21' | '27';
type FormaPagoValue = 'Efectivo' | 'Transferencia' | 'Tarjeta' | 'Cheque' | 'MercadoPago' | 'Otro';

const ALICUOTA_IVA_VALUES = ['0', '10.5', '21', '27'] as const;
const FORMA_PAGO_VALUES = ['Efectivo', 'Transferencia', 'Tarjeta', 'Cheque', 'MercadoPago', 'Otro'] as const;
const FORMA_PAGO_ALIAS_VALUES = ['EF', 'TC', 'TD', 'TB', 'MP', 'CH', 'DEB', 'OT'] as const;
const MEDIO_PAGO_ALIAS: Record<string, FormaPagoValue> = {
  EF: 'Efectivo',
  TC: 'Tarjeta',
  TD: 'Tarjeta',
  TB: 'Transferencia',
  MP: 'MercadoPago',
  CH: 'Cheque',
  DEB: 'Otro',
  OT: 'Otro',
};

const AlicuotaIVAValueSchema = z.union([
  z.enum(ALICUOTA_IVA_VALUES),
  z.literal(0),
  z.literal(10.5),
  z.literal(21),
  z.literal(27),
]).transform((value): AlicuotaIVAValue => String(value) as AlicuotaIVAValue);

const FormaPagoValueSchema = z.union([
  z.enum(FORMA_PAGO_VALUES),
  z.enum(FORMA_PAGO_ALIAS_VALUES),
]).transform((value): FormaPagoValue => MEDIO_PAGO_ALIAS[value] ?? value);

// ============================================
// Autenticacion
// ============================================
export interface ContabiliumCredentials {
  clientId: string;
  clientSecret: string;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
}

export interface ContabiliumTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
}

// ============================================
// Clientes (Customers)
// ============================================
export const ClienteSchema = z.object({
  Id: z.number().optional(),
  RazonSocial: z.string(),
  NombreFantasia: z.string().optional(),
  NumeroDocumento: z.string(), // CUIT/CUIL/DNI
  TipoDocumento: z.enum(['CUIT', 'CUIL', 'DNI', 'CI', 'LE', 'LC', 'PASAPORTE', 'OTRO']),
  CondicionIVA: z.enum([
    'ResponsableInscripto',
    'Monotributista',
    'Exento',
    'ConsumidorFinal',
    'NoResponsable',
  ]),
  Domicilio: z.string().optional(),
  Localidad: z.string().optional(),
  Provincia: z.string().optional(),
  CodigoPostal: z.string().optional(),
  Telefono: z.string().optional(),
  Email: z.string().email().optional(),
  Observaciones: z.string().optional(),
  Activo: z.boolean().default(true),
});

export type Cliente = z.infer<typeof ClienteSchema>;

export interface ClienteResponse {
  Id: number;
  RazonSocial: string;
  NombreFantasia?: string;
  NumeroDocumento: string;
  TipoDocumento: string;
  CondicionIVA: string;
  Domicilio?: string;
  Localidad?: string;
  Provincia?: string;
  CodigoPostal?: string;
  Telefono?: string;
  Email?: string;
  Observaciones?: string;
  Activo: boolean;
  FechaCreacion: string;
  FechaModificacion: string;
}

// ============================================
// Productos (productos/servicios)
// ============================================
export const ProductoSchema = z.object({
  Id: z.number().optional(),
  Codigo: z.string(),
  Nombre: z.string(),
  Descripcion: z.string().optional(),
  Precio: z.number(),
  Costo: z.number().optional(),
  Stock: z.number().optional(),
  StockMinimo: z.number().optional(),
  UnidadMedida: z.string().default('unidad'),
  CodigoBarras: z.string().optional(),
  Categoria: z.string().optional(),
  Activo: z.boolean().default(true),
  // Impuestos
  AlicuotaIVA: AlicuotaIVAValueSchema.default('21'),
  Exento: z.boolean().default(false),
});

export type Producto = z.input<typeof ProductoSchema>;

export interface ProductoResponse {
  Id: number;
  Codigo: string;
  Nombre: string;
  Descripcion?: string;
  Precio: number;
  Costo?: number;
  Stock?: number;
  StockMinimo?: number;
  UnidadMedida: string;
  CodigoBarras?: string;
  Categoria?: string;
  Activo: boolean;
  AlicuotaIVA: string;
  Exento: boolean;
  FechaCreacion: string;
  FechaModificacion: string;
}

// ============================================
// Comprobantes (facturas/recibos)
// ============================================
export const ItemComprobanteSchema = z.object({
  ProductoId: z.number().optional(),
  Codigo: z.string().optional(),
  Descripcion: z.string(),
  Cantidad: z.number(),
  PrecioUnitario: z.number(),
  Bonificacion: z.number().default(0),
  AlicuotaIVA: AlicuotaIVAValueSchema.default('21'),
  Exento: z.boolean().default(false),
});

export type ItemComprobante = z.input<typeof ItemComprobanteSchema>;

export const ComprobanteSchema = z.object({
  Id: z.number().optional(),
  ClienteId: z.number(),
  Tipo: z.enum([
    'FacturaA',
    'FacturaB',
    'FacturaC',
    'NotaCreditoA',
    'NotaCreditoB',
    'NotaCreditoC',
    'NotaDebitoA',
    'NotaDebitoB',
    'NotaDebitoC',
    'Recibo',
    'Presupuesto',
    'Remito',
  ]),
  PuntoVenta: z.number(),
  Numero: z.number().optional(),
  Fecha: z.string(), // ISO date
  FechaVencimiento: z.string().optional(),
  Moneda: z.enum(['ARS', 'USD']).default('ARS'),
  Cotizacion: z.number().default(1),
  Items: z.array(ItemComprobanteSchema).min(1),
  Observaciones: z.string().optional(),
  // AFIP
  CAE: z.string().optional(),
  CAEVencimiento: z.string().optional(),
  // Pago
  Pagado: z.boolean().default(false),
  FormaPago: FormaPagoValueSchema.optional(),
});

export type Comprobante = z.input<typeof ComprobanteSchema>;

export interface ComprobanteResponse {
  Id: number;
  ClienteId: number;
  Cliente: {
    Id: number;
    RazonSocial: string;
    NumeroDocumento: string;
  };
  Tipo: string;
  PuntoVenta: number;
  Numero: number;
  NumeroCompleto: string; // e.g., "0001-00000123"
  Fecha: string;
  FechaVencimiento?: string;
  Moneda: string;
  Cotizacion: number;
  Subtotal: number;
  TotalIVA: number;
  Total: number;
  Items: Array<{
    Id: number;
    ProductoId?: number;
    Codigo?: string;
    Descripcion: string;
    Cantidad: number;
    PrecioUnitario: number;
    Bonificacion: number;
    AlicuotaIVA: string;
    Subtotal: number;
    IVA: number;
    Total: number;
  }>;
  Observaciones?: string;
  CAE?: string;
  CAEVencimiento?: string;
  Pagado: boolean;
  FormaPago?: string;
  Estado: 'Pendiente' | 'Pagado' | 'Anulado' | 'Vencido';
  FechaCreacion: string;
  FechaModificacion: string;
}

// ============================================
// Pagos (Payments)
// ============================================
export const PagoSchema = z.object({
  Id: z.number().optional(),
  ComprobanteId: z.number(),
  Fecha: z.string(),
  Monto: z.number(),
  FormaPago: FormaPagoValueSchema.optional(),
  MedioPago: FormaPagoValueSchema.optional(),
  Referencia: z.string().optional(), // Referencia externa (por ejemplo, ID de pago de MercadoPago)
  Observaciones: z.string().optional(),
}).superRefine((value, ctx) => {
  if (!value.FormaPago && !value.MedioPago) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['FormaPago'],
      message: 'FormaPago o MedioPago es requerido',
    });
  }
}).transform(({ MedioPago, FormaPago, ...rest }) => ({
  ...rest,
  FormaPago: FormaPago ?? MedioPago!,
}));

export type Pago = z.input<typeof PagoSchema>;

export interface PagoResponse {
  Id: number;
  ComprobanteId: number;
  Fecha: string;
  Monto: number;
  FormaPago?: string;
  MedioPago?: string;
  Referencia?: string;
  Observaciones?: string;
  FechaCreacion: string;
}

// ============================================
// Tipos de respuesta de API
// ============================================
export interface ContabiliumListResponse<T> {
  Items: T[];
  TotalItems: number;
  Page: number;
  PageSize: number;
  TotalPages: number;
}

export interface ContabiliumError {
  Code: string;
  Message: string;
  Details?: string;
}

// ============================================
// Configuracion del conector
// ============================================
export interface ContabiliumConfig {
  clientId: string;
  clientSecret: string;
  environment: 'sandbox' | 'production';
  defaultPuntoVenta?: number;
}
