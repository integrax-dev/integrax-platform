/**
 * Utilidades de CAE (Codigo de Autorizacion Electronica) para AFIP Argentina.
 *
 * Un CAE es un codigo numerico de 14 digitos emitido por AFIP para facturas
 * electronicas autorizadas. Siempre tiene asociada una fecha de vencimiento.
 */

/** Elimina espacios en blanco de una cadena CAE. */
export function normalizeCae(cae: string): string {
  return cae.replace(/\s/g, '');
}

/**
 * Valida que un CAE tenga un formato correcto de 14 digitos.
 * NO verifica autenticidad contra AFIP; para eso hay que consultar FECompConsultar.
 */
export function isValidCaeFormat(cae: string): boolean {
  return /^\d{14}$/.test(normalizeCae(cae));
}

/**
 * Indica si un CAE esta vencido respecto de una fecha de referencia.
 *
 * @param expiryDate Fecha de vencimiento del CAE.
 * @param referenceDate Fecha contra la que se evalua; por defecto se usa ahora.
 */
export function isCaeExpired(expiryDate: Date, referenceDate: Date = new Date()): boolean {
  // Solo comparamos fechas; no horas.
  const expiry = new Date(expiryDate);
  expiry.setHours(23, 59, 59, 999);
  return referenceDate > expiry;
}

/**
 * Valida el vencimiento del CAE; devuelve true si sigue vigente.
 */
export function validateCaeExpiry(cae: string, expiryDate: Date): boolean {
  if (!isValidCaeFormat(cae)) return false;
  return !isCaeExpired(expiryDate);
}
