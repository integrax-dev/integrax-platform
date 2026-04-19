/**
 * Generador minimo de ULID sin dependencias externas.
 * Produce una cadena base32 Crockford de 26 caracteres, ordenable por tiempo.
 *
 * Fuente canonica: todos los paquetes que necesiten un ULID deben importar
 * desde aqui en lugar de duplicar esta implementacion.
 */

const ENCODING = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

function encodeTime(now: number, len: number): string {
  let str = '';
  for (let i = len - 1; i >= 0; i--) {
    str = ENCODING[now % 32] + str;
    now = Math.floor(now / 32);
  }
  return str;
}

function encodeRandom(len: number): string {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  let str = '';
  for (const byte of bytes) {
    str += ENCODING[byte % 32];
  }
  return str;
}

export function ulid(): string {
  return encodeTime(Date.now(), 10) + encodeRandom(16);
}
