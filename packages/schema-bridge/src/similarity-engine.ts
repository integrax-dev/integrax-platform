/**
 * Similarity Engine
 *
 * Detecta campos renombrados entre dos esquemas usando:
 * 1. Levenshtein distance (normalizado)
 * 2. Jaccard sobre trigramas
 * 3. Tabla de sinónimos dominio LatAm (sin LLM)
 *
 * Función pura — sin I/O, sin LLM.
 */

import type { FieldDiff, SimilarityScore } from './types.js';

// ─── Normalización de nombres ─────────────────────────────────────────────────

/**
 * Convierte camelCase, PascalCase y kebab-case a snake_case para comparar.
 */
export function normalizeName(s: string): string {
  return s
    .replace(/([A-Z])/g, '_$1')
    .replace(/-/g, '_')
    .toLowerCase()
    .replace(/__+/g, '_')
    .replace(/^_|_$/g, '');
}

// ─── Levenshtein ──────────────────────────────────────────────────────────────

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

function levenshteinSimilarity(a: string, b: string): number {
  if (a === b) return 1.0;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1.0;
  return 1 - levenshtein(a, b) / maxLen;
}

// ─── Jaccard sobre trigramas ──────────────────────────────────────────────────

function trigrams(s: string): Set<string> {
  const result = new Set<string>();
  const padded = `  ${s}  `;
  for (let i = 0; i < padded.length - 2; i++) {
    result.add(padded.slice(i, i + 3));
  }
  return result;
}

function jaccardSimilarity(a: string, b: string): number {
  const ta = trigrams(a.toLowerCase());
  const tb = trigrams(b.toLowerCase());
  if (ta.size === 0 && tb.size === 0) return 1.0;
  const intersection = [...ta].filter(t => tb.has(t)).length;
  const union = new Set([...ta, ...tb]).size;
  return union === 0 ? 0 : intersection / union;
}

// ─── Tabla de sinónimos LatAm / Argentina ─────────────────────────────────────

const SYNONYM_PAIRS: [string, string][] = [
  // Identificadores
  ['id', 'codigo'], ['id', 'identificador'], ['id', 'nro'], ['id', 'numero'],
  ['codigo', 'code'], ['codigo', 'identificador'],

  // Personas
  ['nombre', 'name'], ['nombre', 'first_name'], ['apellido', 'surname'], ['apellido', 'last_name'],
  ['cliente', 'customer'], ['cliente', 'comprador'], ['cliente', 'buyer'],
  ['proveedor', 'vendor'], ['proveedor', 'supplier'],

  // Dinero
  ['monto', 'amount'], ['monto', 'importe'], ['monto', 'valor'], ['monto', 'total'],
  ['precio', 'price'], ['precio', 'costo'], ['precio', 'tarifa'], ['precio', 'rate'],
  ['importe', 'amount'], ['importe', 'valor'], ['importe', 'total'],

  // Fechas
  ['fecha', 'date'], ['fecha', 'timestamp'], ['fecha', 'created_at'],
  ['fecha_creacion', 'created_at'], ['fecha_actualizacion', 'updated_at'],

  // Contacto
  ['email', 'correo'], ['email', 'mail'], ['email', 'e_mail'],
  ['telefono', 'phone'], ['telefono', 'celular'], ['telefono', 'mobile'],
  ['direccion', 'address'], ['calle', 'street'],

  // Comercio
  ['factura', 'invoice'], ['comprobante', 'receipt'], ['comprobante', 'voucher'],
  ['pedido', 'order'], ['orden', 'order'],
  ['producto', 'product'], ['articulo', 'item'], ['articulo', 'product'],
  ['stock', 'quantity'], ['stock', 'qty'], ['cantidad', 'quantity'], ['cantidad', 'qty'],

  // Fiscal Argentina
  ['cuit', 'tax_id'], ['cuit', 'rut'], ['cuit', 'nit'],
  ['dni', 'documento'], ['dni', 'identification'], ['dni', 'id_number'],
  ['iva', 'vat'], ['iva', 'tax'], ['neto', 'net_amount'],
  ['cae', 'fiscal_code'], ['punto_venta', 'branch_id'],

  // Estado
  ['estado', 'status'], ['estado', 'state'], ['estado_pago', 'payment_status'],
  ['activo', 'active'], ['activo', 'enabled'],

  // Técnicos
  ['url', 'link'], ['url', 'href'], ['imagen', 'image'], ['imagen', 'photo'],
  ['descripcion', 'description'], ['descripcion', 'detail'],
  ['tipo', 'type'], ['tipo', 'kind'], ['tipo', 'category'],
  ['moneda', 'currency'], ['moneda', 'currency_code'],
];

// Construir mapa bidireccional normalizado
const SYNONYM_MAP = new Map<string, Set<string>>();
for (const [a, b] of SYNONYM_PAIRS) {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!SYNONYM_MAP.has(na)) SYNONYM_MAP.set(na, new Set());
  if (!SYNONYM_MAP.has(nb)) SYNONYM_MAP.set(nb, new Set());
  SYNONYM_MAP.get(na)!.add(nb);
  SYNONYM_MAP.get(nb)!.add(na);
}

function semanticSimilarity(a: string, b: string): number {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (na === nb) return 1.0;

  // Lookup directo en tabla de sinónimos
  if (SYNONYM_MAP.get(na)?.has(nb) || SYNONYM_MAP.get(nb)?.has(na)) return 1.0;

  // Substring
  if (na.includes(nb) || nb.includes(na)) return 0.5;

  // Sufijo compartido (ej: "payment_id" vs "id_pago" → ambos contienen "id")
  const tokensA = na.split('_').filter(Boolean);
  const tokensB = nb.split('_').filter(Boolean);
  const shared = tokensA.filter(t => tokensB.includes(t)).length;
  if (shared > 0) return shared / Math.max(tokensA.length, tokensB.length) * 0.6;

  return 0.0;
}

// ─── Score combinado ──────────────────────────────────────────────────────────

function combinedScore(a: string, b: string): SimilarityScore {
  const lev = levenshteinSimilarity(normalizeName(a), normalizeName(b));
  const jac = jaccardSimilarity(normalizeName(a), normalizeName(b));
  const sem = semanticSimilarity(a, b);
  return {
    levenshtein: lev,
    jaccard: jac,
    semantic: sem,
    combined: 0.40 * lev + 0.30 * jac + 0.30 * sem,
  };
}

// ─── SimilarityEngine ─────────────────────────────────────────────────────────

export class SimilarityEngine {
  /**
   * Dado un conjunto de diffs field_removed y field_added,
   * devuelve pares candidatos a renombrado ordenados por score descendente.
   * Usa matching greedy O(n²).
   */
  findRenameCandidates(
    removed: FieldDiff[],
    added: FieldDiff[],
    threshold = 0.70,
  ): FieldDiff[] {
    // Extraer nombres de campo (último segmento del path)
    const removedPaths = removed.map(d => d.pathA!);
    const addedPaths = added.map(d => d.pathB!);

    // Construir matriz de scores
    const scores: Array<{ pathA: string; pathB: string; score: SimilarityScore; diffA: FieldDiff; diffB: FieldDiff }> = [];

    for (const dA of removed) {
      const nameA = fieldName(dA.pathA!);
      for (const dB of added) {
        const nameB = fieldName(dB.pathB!);
        const score = combinedScore(nameA, nameB);
        if (score.combined >= threshold) {
          scores.push({ pathA: dA.pathA!, pathB: dB.pathB!, score, diffA: dA, diffB: dB });
        }
      }
    }

    // Ordenar por score descendente
    scores.sort((a, b) => b.score.combined - a.score.combined);

    // Greedy matching
    const usedA = new Set<string>();
    const usedB = new Set<string>();
    const candidates: FieldDiff[] = [];

    for (const { pathA, pathB, score, diffA, diffB } of scores) {
      if (usedA.has(pathA) || usedB.has(pathB)) continue;
      usedA.add(pathA);
      usedB.add(pathB);

      candidates.push({
        kind: 'rename_candidate',
        pathA,
        pathB,
        nodeA: diffA.nodeA,
        nodeB: diffB.nodeB,
        breakingScore: 0.2,
        similarity: score,
      });
    }

    return candidates;
  }

  /**
   * Calcula el score de similitud entre dos nombres de campo.
   */
  score(nameA: string, nameB: string): SimilarityScore {
    return combinedScore(nameA, nameB);
  }
}

function fieldName(path: string): string {
  const parts = path.split('.');
  return parts[parts.length - 1].replace(/\[\*\]$/, '');
}

export function createSimilarityEngine(): SimilarityEngine {
  return new SimilarityEngine();
}
