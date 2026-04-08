import { createHash } from 'node:crypto';

/**
 * Calcula un hash SHA-256 deterministico para el payload de un objeto plano.
 *
 * Las claves se ordenan antes de serializarlo para que {a:1, b:2} y {b:2, a:1}
 * produzcan el mismo hash.
 */
export function hashPayload(payload: Record<string, unknown>): string {
  const normalized = JSON.stringify(sortKeys(payload));
  return createHash('sha256').update(normalized).digest('hex');
}

function sortKeys(obj: unknown): unknown {
  if (Array.isArray(obj)) return obj.map(sortKeys);
  if (obj !== null && typeof obj === 'object') {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(obj as object).sort()) {
      sorted[key] = sortKeys((obj as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return obj;
}
