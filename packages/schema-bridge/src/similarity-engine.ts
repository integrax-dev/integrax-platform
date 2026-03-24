/**
 * Similarity Engine
 *
 * Detects renamed fields between two schemas using:
 * 1. Levenshtein distance (normalized)
 * 2. Jaccard over trigrams
 * 3. LatAm domain synonym table
 * 4. Value-based matching with probabilistic scoring over overlap, entropy and cardinality
 *
 * Type-bucketing reduces comparisons from O(n^2) to O(n x avg_bucket_size) by only comparing
 * fields of compatible types as rename candidates.
 *
 * Pure function - no I/O, no LLM.
 */

import type { FieldDiff, SchemaNode, SimilarityScore } from './types.js';

interface ValueProfile {
  total: number;
  unique: number;
  entropy: number;
  counts: Map<string, number>;
}

/**
 * Converts camelCase, PascalCase and kebab-case to snake_case for comparison.
 */
export function normalizeName(s: string): string {
  return s
    .replace(/([A-Z])/g, '_$1')
    .replace(/-/g, '_')
    .toLowerCase()
    .replace(/__+/g, '_')
    .replace(/^_|_$/g, '');
}

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

const SYNONYM_PAIRS: [string, string][] = [
  ['id', 'codigo'], ['id', 'identificador'], ['id', 'nro'], ['id', 'numero'],
  ['codigo', 'code'], ['codigo', 'identificador'],
  ['nombre', 'name'], ['nombre', 'first_name'], ['apellido', 'surname'], ['apellido', 'last_name'],
  ['cliente', 'customer'], ['cliente', 'comprador'], ['cliente', 'buyer'],
  ['proveedor', 'vendor'], ['proveedor', 'supplier'],
  ['monto', 'amount'], ['monto', 'importe'], ['monto', 'valor'], ['monto', 'total'],
  ['precio', 'price'], ['precio', 'costo'], ['precio', 'tarifa'], ['precio', 'rate'],
  ['importe', 'amount'], ['importe', 'valor'], ['importe', 'total'],
  ['fecha', 'date'], ['fecha', 'timestamp'], ['fecha', 'created_at'],
  ['fecha_creacion', 'created_at'], ['fecha_actualizacion', 'updated_at'],
  ['email', 'correo'], ['email', 'mail'], ['email', 'e_mail'],
  ['telefono', 'phone'], ['telefono', 'celular'], ['telefono', 'mobile'],
  ['direccion', 'address'], ['calle', 'street'],
  ['factura', 'invoice'], ['comprobante', 'receipt'], ['comprobante', 'voucher'],
  ['pedido', 'order'], ['orden', 'order'],
  ['producto', 'product'], ['articulo', 'item'], ['articulo', 'product'],
  ['stock', 'quantity'], ['stock', 'qty'], ['cantidad', 'quantity'], ['cantidad', 'qty'],
  ['cuit', 'tax_id'], ['cuit', 'rut'], ['cuit', 'nit'],
  ['dni', 'documento'], ['dni', 'identification'], ['dni', 'id_number'],
  ['iva', 'vat'], ['iva', 'tax'], ['neto', 'net_amount'],
  ['cae', 'fiscal_code'], ['punto_venta', 'branch_id'],
  ['estado', 'status'], ['estado', 'state'], ['estado_pago', 'payment_status'],
  ['activo', 'active'], ['activo', 'enabled'],
  ['url', 'link'], ['url', 'href'], ['imagen', 'image'], ['imagen', 'photo'],
  ['descripcion', 'description'], ['descripcion', 'detail'],
  ['tipo', 'type'], ['tipo', 'kind'], ['tipo', 'category'],
  ['moneda', 'currency'], ['moneda', 'currency_code'],
];

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

  if (SYNONYM_MAP.get(na)?.has(nb) || SYNONYM_MAP.get(nb)?.has(na)) return 1.0;
  if (na.includes(nb) || nb.includes(na)) return 0.5;

  const tokensA = na.split('_').filter(Boolean);
  const tokensB = nb.split('_').filter(Boolean);
  const shared = tokensA.filter(t => tokensB.includes(t)).length;
  if (shared > 0) {
    return shared / Math.max(tokensA.length, tokensB.length) * 0.6;
  }

  return 0.0;
}

function normalizeValueForMatching(value: unknown): string {
  if (value === null) return '<null>';
  if (value === undefined) return '<undefined>';
  if (typeof value === 'string') return value.trim().toLowerCase();
  if (typeof value === 'number' || typeof value === 'bigint' || typeof value === 'boolean') {
    return String(value).toLowerCase();
  }
  return JSON.stringify(value);
}

function shannonEntropy(counts: Map<string, number>, total: number): number {
  if (total === 0 || counts.size === 0) return 0;

  let entropy = 0;
  for (const count of counts.values()) {
    const probability = count / total;
    entropy -= probability * Math.log2(probability);
  }

  const normalizer = Math.log2(counts.size || 1);
  if (normalizer === 0) return 0;
  return entropy / normalizer;
}

function intrinsicTokenInformation(token: string): number {
  if (token.length === 0) return 0;

  const lengthWeight = Math.sqrt(Math.min(1, token.length / 12)) * Math.min(1, token.length / 3);
  const uniqueCharRatio = new Set(token).size / token.length;
  const shapeWeight = lengthWeight * uniqueCharRatio;
  const classCount =
    Number(/[a-z]/i.test(token)) +
    Number(/\d/.test(token)) +
    Number(/[^a-z0-9]/i.test(token));
  const classWeight = classCount / 3;

  return 0.6 * lengthWeight + 0.25 * shapeWeight + 0.15 * classWeight;
}

function valueReliability(node: SchemaNode): number {
  const type = primaryType(node);
  if (type === 'boolean') return 0.15;
  if (type === 'number') return 0.75;
  if (node.format === 'date' || node.format === 'date-time') return 0.35;
  return 1.0;
}

function buildValueProfile(node: SchemaNode): ValueProfile {
  const counts = new Map<string, number>();

  for (const example of node.examples) {
    const normalized = normalizeValueForMatching(example);
    counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
  }

  const total = node.examples.length;
  const unique = counts.size;
  const entropy = shannonEntropy(counts, total);

  return { total, unique, entropy, counts };
}

function valueSimilarity(nodeA: SchemaNode | null, nodeB: SchemaNode | null): number {
  if (!nodeA || !nodeB) return 0;

  const profileA = buildValueProfile(nodeA);
  const profileB = buildValueProfile(nodeB);
  if (profileA.total === 0 || profileB.total === 0) return 0;

  const overlappingTokens = [...profileA.counts.keys()].filter(token => profileB.counts.has(token));
  if (overlappingTokens.length === 0) return 0;

  let overlapCount = 0;
  let weightedOverlapInformation = 0;
  for (const token of overlappingTokens) {
    const overlap = Math.min(profileA.counts.get(token) ?? 0, profileB.counts.get(token) ?? 0);
    overlapCount += overlap;
    weightedOverlapInformation += intrinsicTokenInformation(token) * overlap;
  }

  const overlapRatio = overlapCount / Math.max(profileA.total, profileB.total);
  const averageOverlapInformation = overlapCount === 0 ? 0 : weightedOverlapInformation / overlapCount;
  const entropySignal = Math.max(profileA.entropy, profileB.entropy);
  const cardinalitySignal = Math.sqrt(Math.min(1, Math.min(profileA.unique, profileB.unique) / 3));
  const reliability = Math.sqrt(valueReliability(nodeA) * valueReliability(nodeB));

  const probabilisticScore =
    overlapRatio *
    (0.35 * averageOverlapInformation + 0.40 * entropySignal + 0.25 * cardinalitySignal) *
    reliability;

  return Math.max(0, Math.min(1, probabilisticScore));
}

function combinedScore(
  a: string,
  b: string,
  nodeA: SchemaNode | null = null,
  nodeB: SchemaNode | null = null,
): SimilarityScore {
  const lev = levenshteinSimilarity(normalizeName(a), normalizeName(b));
  const jac = jaccardSimilarity(normalizeName(a), normalizeName(b));
  const sem = semanticSimilarity(a, b);
  const val = valueSimilarity(nodeA, nodeB);
  const lexical = 0.45 * lev + 0.35 * jac + 0.20 * sem;

  const combined =
    sem >= 1.0
      ? 1.0
      : Math.max(lexical, 0.90 * val + 0.10 * lexical);

  return { levenshtein: lev, jaccard: jac, semantic: sem, value: val, combined };
}

export class SimilarityEngine {
  /**
   * Given field_removed and field_added diffs, returns rename candidates sorted by score desc.
   *
   * Type-bucketing: added fields are grouped by their primary JSON type before the loop.
   * Each removed field only compares against fields of the same type (+ 'unknown' bucket for
   * fields whose type could not be determined). Reduces comparisons from O(n^2) to
   * O(n x avg_bucket_size).
   */
  findRenameCandidates(
    removed: FieldDiff[],
    added: FieldDiff[],
    threshold = 0.70,
  ): FieldDiff[] {
    const addedByType = new Map<string, FieldDiff[]>();
    for (const dB of added) {
      const type = primaryType(dB.nodeB);
      const bucket = addedByType.get(type);
      if (bucket) bucket.push(dB);
      else addedByType.set(type, [dB]);
    }

    const scores: Array<{
      pathA: string;
      pathB: string;
      score: SimilarityScore;
      diffA: FieldDiff;
      diffB: FieldDiff;
    }> = [];

    for (const dA of removed) {
      const typeA = primaryType(dA.nodeA);
      const nameA = fieldName(dA.pathA!);
      const bucket = addedByType.get(typeA) ?? [];
      const unknownBucket = typeA !== 'unknown' ? (addedByType.get('unknown') ?? []) : [];

      for (const dB of [...bucket, ...unknownBucket]) {
        const nameB = fieldName(dB.pathB!);
        const score = combinedScore(nameA, nameB, dA.nodeA, dB.nodeB);
        if (score.combined >= threshold) {
          scores.push({ pathA: dA.pathA!, pathB: dB.pathB!, score, diffA: dA, diffB: dB });
        }
      }
    }

    scores.sort((a, b) => b.score.combined - a.score.combined);

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

  score(nameA: string, nameB: string): SimilarityScore {
    return combinedScore(nameA, nameB, null, null);
  }
}

function fieldName(path: string): string {
  const parts = path.split('.');
  return parts[parts.length - 1].replace(/\[\*\]$/, '');
}

function primaryType(node: SchemaNode | null): string {
  if (!node) return 'unknown';
  if (Array.isArray(node.type)) return node.type.find(t => t !== 'null') ?? 'null';
  return node.type;
}

export function createSimilarityEngine(): SimilarityEngine {
  return new SimilarityEngine();
}
