import { createHmac, timingSafeEqual } from 'node:crypto';
import type { SignatureAlgorithm } from './types.js';

/**
 * Valida la firma HMAC de un webhook.
 *
 * Usa `timingSafeEqual` para evitar ataques de timing.
 *
 * @param payload Cuerpo crudo de la request como Buffer.
 * @param signature Firma recibida en el header, sin prefijo.
 * @param secret Secreto compartido.
 * @param algorithm Algoritmo HMAC.
 * @returns true si la firma coincide; false en caso contrario.
 */
export function validateSignature(
  payload: Buffer,
  signature: string,
  secret: string,
  algorithm: SignatureAlgorithm = 'hmac-sha256',
): boolean {
  const hmacAlgo = algorithm === 'hmac-sha256' ? 'sha256' : 'sha512';
  const expected = createHmac(hmacAlgo, secret).update(payload).digest('hex');

  try {
    return timingSafeEqual(
      Buffer.from(expected, 'utf8'),
      Buffer.from(signature, 'utf8'),
    );
  } catch {
    return false;
  }
}

/**
 * Elimina un prefijo conocido del valor del header de firma.
 * Por ejemplo 'sha256=abc123' con prefijo 'sha256=' -> 'abc123'
 */
export function stripSignaturePrefix(rawHeader: string, prefix?: string): string {
  if (!prefix) return rawHeader;
  return rawHeader.startsWith(prefix) ? rawHeader.slice(prefix.length) : rawHeader;
}
