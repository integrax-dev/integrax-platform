/**
 * Similarity Engine
 *
 * Detecta renombrados usando señal lexical, semántica y estadística.
 * La señal de valores no ignora categorías ambiguas: las degrada matemáticamente
 * usando entropía, cardinalidad e información intrínseca del token.
 */

import { defaultBusinessTypeWeights } from './business-type-registry.js';
import type {
  FieldDiff,
  SchemaNode,
  SimilarityEngineConfig,
  SimilarityScore,
} from './types.js';

interface ValueProfile {
  total: number;
  unique: number;
  entropy: number;
  counts: Map<string, number>;
}

interface CandidateScore {
  pathA: string;
  pathB: string;
  score: SimilarityScore;
  diffA: FieldDiff;
  diffB: FieldDiff;
}

const PLACEHOLDER_TOKENS = new Set([
  '',
  '<null>',
  '<undefined>',
  'n/a',
  'na',
  'none',
  'null',
  'undefined',
  'unknown',
  '-',
]);

/**
 * Converts camelCase, PascalCase and kebab-case to snake_case for comparison.
 */
export function normalizeName(s: string): string {
  if (/^[A-Z0-9_]+$/.test(s)) {
    return s.toLowerCase().replace(/__+/g, '_').replace(/^_|_$/g, '');
  }

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
  ['nombre', 'name'], ['nombre', 'first_name'], ['nombre', 'fname'], ['apellido', 'surname'], ['apellido', 'last_name'], ['apellido', 'lname'],
  ['given_name', 'first_name'], ['given_name', 'fname'], ['family_name', 'last_name'], ['family_name', 'lname'],
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
  ['stock', 'quantity'], ['stock', 'qty'], ['cantidad', 'quantity'], ['cantidad', 'qty'], ['qty_value', 'quantity'],
  ['cuit', 'tax_id'], ['cuit', 'rut'], ['cuit', 'nit'],
  ['dni', 'documento'], ['dni', 'identification'], ['dni', 'id_number'],
  ['iva', 'vat'], ['iva', 'tax'], ['neto', 'net_amount'],
  ['cae', 'fiscal_code'], ['punto_venta', 'branch_id'],
  ['estado', 'status'], ['estado', 'state'], ['estado_pago', 'payment_status'],
  ['activo', 'active'], ['activo', 'enabled'],
  ['url', 'link'], ['url', 'href'], ['url', 'website'], ['imagen', 'image'], ['imagen', 'photo'],
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

function tokenReliability(token: string): number {
  const normalized = token.trim().toLowerCase();

  if (PLACEHOLDER_TOKENS.has(normalized)) return 0.03;
  if (normalized === 'true' || normalized === 'false') return 0.06;
  if (/^\d{4}-\d{2}-\d{2}(t.*)?$/i.test(normalized)) return 0.22;
  if (/^-?\d+$/.test(normalized)) {
    const digits = normalized.replace(/[^0-9]/g, '').length;
    if (digits <= 2) return 0.08;
    if (digits <= 4) return 0.28;
    if (digits <= 8) return 0.58;
    return 0.82;
  }
  if (/^-?\d+(?:[.,]\d+)?$/.test(normalized)) {
    return normalized.length >= 7 ? 0.55 : 0.16;
  }
  if (/^[a-z]{1,3}$/i.test(normalized)) return 0.12;

  return 1.0;
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

  return (0.6 * lengthWeight + 0.25 * shapeWeight + 0.15 * classWeight) * tokenReliability(token);
}

function primaryType(node: SchemaNode | null): string {
  if (!node) return 'unknown';
  if (Array.isArray(node.type)) return node.type.find(t => t !== 'null') ?? 'null';
  return node.type;
}

function valueReliability(node: SchemaNode, weights: Map<string, number>): number {
  const type = primaryType(node);
  if (type === 'boolean') return 0.12;
  if (type === 'number') return 0.75;
  if (node.format && weights.has(node.format)) {
    return weights.get(node.format)!;
  }
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

function valueSimilarity(nodeA: SchemaNode | null, nodeB: SchemaNode | null, weights: Map<string, number>): number {
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
  const diversitySignal =
    Math.sqrt(Math.min(1, (profileA.unique / Math.max(1, profileA.total)) * (profileB.unique / Math.max(1, profileB.total))));
  const reliability = Math.sqrt(valueReliability(nodeA, weights) * valueReliability(nodeB, weights));

  const score =
    overlapRatio *
    (0.30 * averageOverlapInformation + 0.30 * entropySignal + 0.25 * cardinalitySignal + 0.15 * diversitySignal) *
    reliability;

  return Math.max(0, Math.min(1, score));
}

function businessTypeSimilarity(
  nodeA: SchemaNode | null,
  nodeB: SchemaNode | null,
  weights: Map<string, number>,
): number {
  if (!nodeA || !nodeB || !nodeA.format || !nodeB.format) return 0;
  if (nodeA.format === nodeB.format) return weights.get(nodeA.format) ?? 0;

  const dateFamily = new Set(['date', 'date-time']);
  if (dateFamily.has(nodeA.format) && dateFamily.has(nodeB.format)) {
    return 0.35;
  }

  return 0;
}

function fieldName(path: string): string {
  const parts = path.split('.');
  return parts[parts.length - 1].replace(/\[\*\]$/, '');
}

function arrayDepth(path: string): number {
  const matches = path.match(/\[\*\]/g);
  return matches ? matches.length : 0;
}

function pathTokens(path: string): string[] {
  return path
    .split('.')
    .map(segment => normalizeName(segment.replace(/\[\*\]/g, '')))
    .filter(Boolean);
}

function parentTokens(path: string): string[] {
  const tokens = pathTokens(path);
  return tokens.slice(0, -1);
}

function structuralSimilarity(pathA: string, pathB: string): number {
  const depthScore = Math.max(0.4, 1 - 0.15 * Math.abs(arrayDepth(pathA) - arrayDepth(pathB)));
  const parentsA = new Set(parentTokens(pathA).slice(-4));
  const parentsB = new Set(parentTokens(pathB).slice(-4));

  if (parentsA.size === 0 && parentsB.size === 0) return depthScore;

  const sharedParents = [...parentsA].filter(token => parentsB.has(token)).length;
  const unionParents = new Set([...parentsA, ...parentsB]).size || 1;
  const parentScore = sharedParents / unionParents;

  return 0.7 * depthScore + 0.3 * parentScore;
}

function combinedScore(
  pathA: string,
  pathB: string,
  nodeA: SchemaNode | null,
  nodeB: SchemaNode | null,
  weights: Map<string, number>,
): SimilarityScore {
  const a = fieldName(pathA);
  const b = fieldName(pathB);
  const lev = levenshteinSimilarity(normalizeName(a), normalizeName(b));
  const jac = jaccardSimilarity(normalizeName(a), normalizeName(b));
  const sem = semanticSimilarity(a, b);
  const val = valueSimilarity(nodeA, nodeB, weights);
  const business = businessTypeSimilarity(nodeA, nodeB, weights);
  const structural = structuralSimilarity(pathA, pathB);
  const lexical = 0.45 * lev + 0.35 * jac + 0.20 * sem;
  const structurallyWeightedLexical = lexical * (0.75 + 0.25 * structural);
  const structurallyWeightedValue = val * (0.80 + 0.20 * structural);
  const probabilistic =
    business >= 0.9
      ? 0.62 * structurallyWeightedValue + 0.30 * business + 0.08 * structurallyWeightedLexical
      : 0.80 * structurallyWeightedValue + 0.10 * business + 0.10 * structurallyWeightedLexical;
  const strongValueFloor =
    structural >= 0.55 && (
      val >= 0.85 ||
      (business >= 0.9 && val >= 0.65)
    )
      ? 0.72 + 0.06 * business
      : 0;

  const combined =
    sem >= 1.0
      ? 1.0
      : business >= 0.95 && val >= 0.88 && structural >= 0.75
        ? Math.max(probabilistic, 0.96)
        : Math.max(structurallyWeightedLexical, probabilistic, strongValueFloor);

  return {
    levenshtein: lev,
    jaccard: jac,
    semantic: sem,
    value: val,
    combined: Math.max(0, Math.min(1, combined)),
  };
}

function comparisonSort(a: CandidateScore, b: CandidateScore): number {
  if (b.score.combined !== a.score.combined) return b.score.combined - a.score.combined;
  if ((b.score.margin ?? 0) !== (a.score.margin ?? 0)) return (b.score.margin ?? 0) - (a.score.margin ?? 0);
  return (b.score.reciprocalMargin ?? 0) - (a.score.reciprocalMargin ?? 0);
}

function bucketKey(type: string, path: string): string {
  return `${type}:${arrayDepth(path)}`;
}

function arrayContextKey(path: string): string {
  const arrays = path
    .split('.')
    .filter(segment => segment.includes('[*]'))
    .map(segment => normalizeName(segment.replace(/\[\*\]/g, '')))
    .filter(Boolean)
    .slice(-3);
  return arrays.join('/');
}

function topTwoScores(values: number[]): [number, number] {
  let best = 0;
  let second = 0;

  for (const value of values) {
    if (value > best) {
      second = best;
      best = value;
    } else if (value > second) {
      second = value;
    }
  }

  return [best, second];
}

export class SimilarityEngine {
  private readonly weights: Map<string, number>;

  constructor(config: SimilarityEngineConfig = {}) {
    this.weights = new Map(Object.entries({
      ...defaultBusinessTypeWeights,
      ...(config.businessTypeWeights ?? {}),
    }));
  }

  findRenameCandidates(
    removed: FieldDiff[],
    added: FieldDiff[],
    threshold = 0.70,
  ): FieldDiff[] {
    const addedByExactBucket = new Map<string, FieldDiff[]>();
    const addedByDepthBucket = new Map<string, FieldDiff[]>();
    const addedByPrimaryType = new Map<string, FieldDiff[]>();

    for (const dB of added) {
      const primary = primaryType(dB.nodeB);
      const exactKey = `${bucketKey(primary, dB.pathB!)}:${arrayContextKey(dB.pathB!)}`;
      const depthKey = bucketKey(primary, dB.pathB!);
      addedByExactBucket.set(exactKey, [...(addedByExactBucket.get(exactKey) ?? []), dB]);
      addedByDepthBucket.set(depthKey, [...(addedByDepthBucket.get(depthKey) ?? []), dB]);
      addedByPrimaryType.set(primary, [...(addedByPrimaryType.get(primary) ?? []), dB]);
    }

    const comparisons: CandidateScore[] = [];

    for (const dA of removed) {
      const typeA = primaryType(dA.nodeA);
      const exactKey = `${bucketKey(typeA, dA.pathA!)}:${arrayContextKey(dA.pathA!)}`;
      const candidates = new Map<string, FieldDiff>();

      for (const candidate of addedByExactBucket.get(exactKey) ?? []) {
        candidates.set(candidate.pathB!, candidate);
      }
      for (const candidate of addedByDepthBucket.get(bucketKey(typeA, dA.pathA!)) ?? []) {
        candidates.set(candidate.pathB!, candidate);
      }
      for (const candidate of addedByPrimaryType.get(typeA) ?? []) {
        candidates.set(candidate.pathB!, candidate);
      }
      if (typeA !== 'unknown') {
        for (const candidate of addedByPrimaryType.get('unknown') ?? []) {
          candidates.set(candidate.pathB!, candidate);
        }
      }

      for (const dB of candidates.values()) {
        comparisons.push({
          pathA: dA.pathA!,
          pathB: dB.pathB!,
          score: combinedScore(dA.pathA!, dB.pathB!, dA.nodeA, dB.nodeB, this.weights),
          diffA: dA,
          diffB: dB,
        });
      }
    }

    const bySource = new Map<string, number[]>();
    const byTarget = new Map<string, number[]>();

    for (const comparison of comparisons) {
      bySource.set(comparison.pathA, [...(bySource.get(comparison.pathA) ?? []), comparison.score.combined]);
      byTarget.set(comparison.pathB, [...(byTarget.get(comparison.pathB) ?? []), comparison.score.combined]);
    }

    const annotated = comparisons
      .map(comparison => {
        const [bestA, secondA] = topTwoScores(bySource.get(comparison.pathA) ?? []);
        const [bestB, secondB] = topTwoScores(byTarget.get(comparison.pathB) ?? []);
        const margin = comparison.score.combined >= bestA ? comparison.score.combined - secondA : 0;
        const reciprocalMargin = comparison.score.combined >= bestB ? comparison.score.combined - secondB : 0;

        return {
          ...comparison,
          score: {
            ...comparison.score,
            margin: Math.max(0, margin),
            reciprocalMargin: Math.max(0, reciprocalMargin),
          },
        };
      })
      .filter(comparison => comparison.score.combined >= threshold);

    annotated.sort(comparisonSort);

    const usedA = new Set<string>();
    const usedB = new Set<string>();
    const candidates: FieldDiff[] = [];

    for (const { pathA, pathB, score, diffA, diffB } of annotated) {
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
    return combinedScore(nameA, nameB, null, null, this.weights);
  }
}

export function createSimilarityEngine(config: SimilarityEngineConfig = {}): SimilarityEngine {
  return new SimilarityEngine(config);
}
