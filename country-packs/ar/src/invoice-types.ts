/**
 * Codigos y metadatos de tipos de comprobante AFIP.
 *
 * Fuente: AFIP RG 2291 y resoluciones posteriores.
 */

export interface AfipInvoiceTypeInfo {
  code: number;
  name: string;
  /** Indica si este tipo requiere autorizacion CAE via WSFE. */
  requiresCae: boolean;
  /** Indica si este tipo aplica a Responsable Inscripto. */
  forResponsableInscripto: boolean;
}

export const AR_INVOICE_TYPES: Record<number, AfipInvoiceTypeInfo> = {
  1:  { code: 1,  name: 'Factura A', requiresCae: true, forResponsableInscripto: true },
  2:  { code: 2,  name: 'Nota de Debito A', requiresCae: true, forResponsableInscripto: true },
  3:  { code: 3,  name: 'Nota de Credito A', requiresCae: true, forResponsableInscripto: true },
  4:  { code: 4,  name: 'Recibo A', requiresCae: true, forResponsableInscripto: true },
  5:  { code: 5,  name: 'Nota de Venta A', requiresCae: true, forResponsableInscripto: true },
  6:  { code: 6,  name: 'Factura B', requiresCae: true, forResponsableInscripto: false },
  7:  { code: 7,  name: 'Nota de Debito B', requiresCae: true, forResponsableInscripto: false },
  8:  { code: 8,  name: 'Nota de Credito B', requiresCae: true, forResponsableInscripto: false },
  9:  { code: 9,  name: 'Recibo B', requiresCae: true, forResponsableInscripto: false },
  10: { code: 10, name: 'Nota de Venta B', requiresCae: true, forResponsableInscripto: false },
  11: { code: 11, name: 'Factura C', requiresCae: true, forResponsableInscripto: false },
  12: { code: 12, name: 'Nota de Debito C', requiresCae: true, forResponsableInscripto: false },
  13: { code: 13, name: 'Nota de Credito C', requiresCae: true, forResponsableInscripto: false },
  15: { code: 15, name: 'Recibo C', requiresCae: true, forResponsableInscripto: false },
  19: { code: 19, name: 'Factura E (exportacion)', requiresCae: true, forResponsableInscripto: true },
  20: { code: 20, name: 'Nota de Debito E', requiresCae: true, forResponsableInscripto: true },
  21: { code: 21, name: 'Nota de Credito E', requiresCae: true, forResponsableInscripto: true },
  51: { code: 51, name: 'Factura M', requiresCae: true, forResponsableInscripto: true },
  52: { code: 52, name: 'Nota de Debito M', requiresCae: true, forResponsableInscripto: true },
  53: { code: 53, name: 'Nota de Credito M', requiresCae: true, forResponsableInscripto: true },
};

/** Devuelve true si el codigo es un tipo de comprobante AFIP conocido. */
export function validateAfipInvoiceType(type: number): boolean {
  return type in AR_INVOICE_TYPES;
}

/** Devuelve el nombre de visualizacion de un tipo AFIP, o undefined si no existe. */
export function getAfipInvoiceTypeName(type: number): string | undefined {
  return AR_INVOICE_TYPES[type]?.name;
}

/** Devuelve true si el tipo de comprobante requiere CAE. */
export function requiresCae(type: number): boolean {
  return AR_INVOICE_TYPES[type]?.requiresCae ?? false;
}
