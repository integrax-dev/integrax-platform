/** CNPJ — Cadastro Nacional da Pessoa Jurídica (Brazil legal entity tax ID) */

/** Strip all non-digit characters from a CNPJ string. */
export function normalizeCnpj(raw: string): string {
  return raw.replace(/\D/g, '');
}

/** Returns true if the string, after normalization, has exactly 14 digits. */
export function isValidCnpjFormat(raw: string): boolean {
  return /^\d{14}$/.test(normalizeCnpj(raw));
}

/**
 * Validates CNPJ check digits (modulo 11 algorithm).
 * Returns false for known invalid sequences (all same digits).
 */
export function validateCnpj(raw: string): boolean {
  const digits = normalizeCnpj(raw);
  if (digits.length !== 14) return false;
  if (/^(\d)\1+$/.test(digits)) return false; // all same digits

  const calc = (n: number): number => {
    let sum = 0;
    let pos = n - 7;
    for (let i = n; i >= 1; i--) {
      sum += Number(digits[n - i]) * pos--;
      if (pos < 2) pos = 9;
    }
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  };

  return calc(12) === Number(digits[12]) && calc(13) === Number(digits[13]);
}

/** Format a normalized CNPJ as XX.XXX.XXX/XXXX-XX */
export function formatCnpj(raw: string): string {
  const d = normalizeCnpj(raw);
  if (d.length !== 14) return raw;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}
