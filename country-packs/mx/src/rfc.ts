/** RFC — Registro Federal de Contribuyentes (Mexico tax ID) */

/** Strip whitespace and uppercase an RFC string for comparison. */
export function normalizeRfc(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, '');
}

/**
 * Validates RFC format:
 *   Persona Moral:  3 letters + 6 digits + 3 alphanumeric  (12 chars)
 *   Persona Física: 4 letters + 6 digits + 3 alphanumeric  (13 chars)
 *   Generic:         XAXX010101000  (homoclave for foreigners)
 */
export function isValidRfcFormat(raw: string): boolean {
  return /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/i.test(normalizeRfc(raw));
}
