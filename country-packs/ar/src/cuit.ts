/**
 * Utilidades de CUIT / CUIL para Argentina.
 *
 * Un CUIT se ve asi: 20-12345678-9
 * Forma normalizada: 20123456789 (11 digitos, sin guiones ni espacios)
 */

/** Elimina guiones, espacios y puntos de una cadena CUIT/CUIL. */
export function normalizeCuit(cuit: string): string {
  return cuit.replace(/[\s\-\.]/g, '');
}

/**
 * Valida un CUIT/CUIL usando el algoritmo oficial del digito verificador.
 *
 * Devuelve false si luego de normalizar no quedan exactamente 11 digitos.
 */
export function validateCuit(cuit: string): boolean {
  const normalized = normalizeCuit(cuit);
  if (!/^\d{11}$/.test(normalized)) return false;

  const weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += parseInt(normalized[i], 10) * weights[i];
  }
  const remainder = sum % 11;
  let checkDigit: number;
  if (remainder === 0) {
    checkDigit = 0;
  } else if (remainder === 1) {
    // Variante con resto 1: el prefijo del tipo determina combinaciones invalidas.
    // En la practica AFIP asigna otros prefijos para evitar este caso.
    // Devolvemos false para mantenerlo simple; los CUIT reales no suelen caer aca.
    return false;
  } else {
    checkDigit = 11 - remainder;
  }
  return checkDigit === parseInt(normalized[10], 10);
}

/**
 * Formatea un CUIT normalizado como XX-XXXXXXXX-X para mostrarlo.
 * La entrada debe tener exactamente 11 digitos.
 */
export function formatCuit(cuit: string): string {
  const n = normalizeCuit(cuit);
  if (n.length !== 11) return cuit;
  return `${n.slice(0, 2)}-${n.slice(2, 10)}-${n[10]}`;
}
