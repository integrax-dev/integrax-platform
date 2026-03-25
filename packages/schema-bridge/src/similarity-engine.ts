/**
 * Similarity Engine
 *
 * Construye evidencia explícita por canal:
 *   - lexical
 *   - value distribution
 *   - structural/path context
 *   - business type
 *   - ontology
 *
 * La decisión final no surge de un promedio opaco, sino de reglas de
 * corroboración entre canales más márgenes competitivos.
 */

import {
  defaultBusinessTypeWeights,
} from './business-type-registry.js';
import { defaultOntologyProviders } from './ontology-registry.js';
import { SimilarityDecisionPolicy } from './similarity-decision-policy.js';
import type {
  FieldDiff,
  OntologyProvider,
  SchemaNode,
  SimilarityEngineConfig,
  SimilarityEvidenceBreakdown,
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

interface PathContext {
  leaf: string;
  ancestors: string[];
  arrayAncestors: string[];
  depth: number;
  signature: string;
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
  'tbd',
]);

export function normalizeName(value: string): string {
  if (/^[A-Z0-9_]+$/.test(value)) {
    return value.toLowerCase().replace(/__+/g, '_').replace(/^_|_$/g, '');
  }

  return value
    .replace(/([A-Z])/g, '_$1')
    .replace(/-/g, '_')
    .toLowerCase()
    .replace(/__+/g, '_')
    .replace(/^_|_$/g, '');
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function levenshtein(left: string, right: string): number {
  const rows = left.length + 1;
  const cols = right.length + 1;
  const dp: number[][] = Array.from({ length: rows }, (_, row) =>
    Array.from({ length: cols }, (_, col) => (row === 0 ? col : col === 0 ? row : 0))
  );

  for (let row = 1; row < rows; row++) {
    for (let col = 1; col < cols; col++) {
      dp[row][col] = left[row - 1] === right[col - 1]
        ? dp[row - 1][col - 1]
        : 1 + Math.min(dp[row - 1][col], dp[row][col - 1], dp[row - 1][col - 1]);
    }
  }

  return dp[left.length][right.length];
}

function levenshteinSimilarity(left: string, right: string): number {
  if (left === right) return 1;
  const maxLength = Math.max(left.length, right.length);
  if (maxLength === 0) return 1;
  return 1 - levenshtein(left, right) / maxLength;
}

function trigrams(value: string): Set<string> {
  const result = new Set<string>();
  const padded = `  ${value}  `;
  for (let index = 0; index < padded.length - 2; index++) {
    result.add(padded.slice(index, index + 3));
  }
  return result;
}

function jaccardSimilarity(left: string, right: string): number {
  const leftTrigrams = trigrams(left.toLowerCase());
  const rightTrigrams = trigrams(right.toLowerCase());
  if (leftTrigrams.size === 0 && rightTrigrams.size === 0) return 1;
  const intersection = [...leftTrigrams].filter(token => rightTrigrams.has(token)).length;
  const union = new Set([...leftTrigrams, ...rightTrigrams]).size;
  return union === 0 ? 0 : intersection / union;
}

function semanticSimilarity(left: string, right: string): number {
  const normalizedLeft = normalizeName(left);
  const normalizedRight = normalizeName(right);
  if (normalizedLeft === normalizedRight) return 1;

  const leftTokens = normalizedLeft.split('_').filter(Boolean);
  const rightTokens = normalizedRight.split('_').filter(Boolean);
  if (leftTokens.length === 0 || rightTokens.length === 0) return 0;

  const shared = leftTokens.filter(token => rightTokens.includes(token)).length;
  if (shared === 0) return 0;
  return shared / Math.max(leftTokens.length, rightTokens.length);
}

/** @internal — exported for unit testing only */
export function _tokenReliability(token: string): number {
  return tokenReliability(token);
}

/** @internal — exported for unit testing only */
export function _normalizeValueForMatching(value: unknown): string {
  return normalizeValueForMatching(value);
}

/**
 * Normaliza un valor a una string canónica para Jaccard overlap.
 *
 * Reglas especiales para datos LatAm / legacy:
 *  - Decimal comma ("1234,56") → punto decimal ("1234.56")
 *    Aplica solo cuando: string de dígitos con coma seguida de exactamente 1-4 dígitos
 *    y sin punto (distingue "1.234,56" euro-style de "AR,US" que son dos códigos).
 *  - Fecha DD/MM/YYYY → YYYY-MM-DD (ISO 8601)
 *  - Fecha YYYYMMDD (entero o string de 8 dígitos en rango 19000101-20991231) → YYYY-MM-DD
 *
 * Conservadora: si el patrón es ambiguo, no normaliza.
 */
function normalizeValueForMatching(value: unknown): string {
  if (value === null) return '<null>';
  if (value === undefined) return '<undefined>';

  if (typeof value === 'string') {
    const s = value.trim();

    // Fecha DD/MM/YYYY — inequívoco: dos dígitos, slash, dos dígitos, slash, cuatro dígitos
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) {
      const [d, m, y] = s.split('/');
      return `${y}-${m}-${d}`;
    }

    // Fecha YYYYMMDD como string de 8 dígitos (formato AFIP y legacy ERPs)
    if (/^\d{8}$/.test(s)) {
      const year = Number(s.slice(0, 4));
      const month = Number(s.slice(4, 6));
      const day = Number(s.slice(6, 8));
      if (year >= 1900 && year <= 2099 && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
      }
    }

    // Decimal comma: "1234,56" → canonical float string ("1234.56")
    // Usa parseFloat para eliminar ceros finales: "15000,00" → "15000" (no "15000.00").
    // Esto permite matching con valores numéricos JS: 15000.0 → String(15000) = "15000".
    // Solo aplica cuando: toda la parte entera son dígitos, hay una coma,
    // y la parte decimal tiene 1-4 dígitos.
    // No aplica a "AR,US" porque "AR" no es puramente numérico.
    if (/^-?\d+,\d{1,4}$/.test(s)) {
      return String(parseFloat(s.replace(',', '.'))).toLowerCase();
    }

    // Decimal dot trailing zeros: "1500.50" → "1500.5", "15000.00" → "15000"
    // Normaliza strings con punto decimal al mismo formato canónico que produce
    // el bloque decimal-comma. Permite que "15000,00" (LatAm) y "15000.00" (US/moderno)
    // sean idénticos después de la normalización — ambos → "15000".
    // Solo aplica a strings con exactamente un punto decimal.
    if (/^-?\d+\.\d+$/.test(s)) {
      return String(parseFloat(s)).toLowerCase();
    }

    return s.toLowerCase();
  }

  if (typeof value === 'number' || typeof value === 'bigint') {
    const n = typeof value === 'number' ? value : Number(value);
    // Entero de 8 dígitos → posible YYYYMMDD (formato AFIP)
    // El rango n >= 19000101 && n <= 20991231 ya garantiza year entre 1900-2099.
    if (Number.isInteger(n) && n >= 19000101 && n <= 20991231) {
      const s = String(n);
      const month = Number(s.slice(4, 6));
      const day = Number(s.slice(6, 8));
      if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
      }
    }
    return String(n).toLowerCase();
  }

  if (typeof value === 'boolean') return String(value);
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
  // 1-char alphabetic ('a', 'y', 'n', 'm'): genuine noise — very low reliability.
  if (/^[a-z]$/i.test(normalized)) return 0.12;
  // 2-char alphabetic: ISO 3166-1 alpha-2 country codes (AR, US, GB, BR, MX…)
  // and ISO 639-1 language codes — discriminative values, treat at mid reliability.
  if (/^[a-z]{2}$/i.test(normalized)) return 0.55;
  // 3-char alphabetic: ISO 4217 currency (EUR, USD, ARS…), ISO 3166-1 alpha-3 —
  // full reliability (handled by falling through to return 1 below).

  return 1;
}

function intrinsicTokenInformation(token: string): number {
  if (token.length === 0) return 0;

  const lengthWeight = Math.sqrt(Math.min(1, token.length / 12)) * Math.min(1, token.length / 3);
  const uniqueCharRatio = new Set(token).size / token.length;
  const classCount =
    Number(/[a-z]/i.test(token)) +
    Number(/\d/.test(token)) +
    Number(/[^a-z0-9]/i.test(token));

  return clamp01(
    (
      0.55 * lengthWeight +
      0.25 * uniqueCharRatio +
      0.20 * (classCount / 3)
    ) * tokenReliability(token)
  );
}

function primaryType(node: SchemaNode | null): string {
  if (!node) return 'unknown';
  if (Array.isArray(node.type)) return node.type.find(type => type !== 'null') ?? 'null';
  return node.type;
}

function valueReliability(node: SchemaNode, weights: Map<string, number>): number {
  const type = primaryType(node);
  if (type === 'boolean') return 0.12;
  if (type === 'number') return 0.75;
  if (node.format && weights.has(node.format)) {
    return weights.get(node.format)!;
  }
  return 1;
}

function evidenceSufficiency(nodeA: SchemaNode | null, nodeB: SchemaNode | null): number {
  const qualityA = nodeA?.evidence?.evidenceQuality ?? 0.35;
  const qualityB = nodeB?.evidence?.evidenceQuality ?? 0.35;
  return Math.sqrt(qualityA * qualityB);
}

function buildValueProfile(node: SchemaNode): ValueProfile {
  const counts = new Map<string, number>();
  for (const example of node.examples) {
    const normalized = normalizeValueForMatching(example);
    counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
  }

  // Para nodos contenedor (object/array) sin ejemplos leaf, construir una firma estructural
  // a partir de los nombres de sus campos hijo. Esto permite que value-similarity detecte que
  // orders[*] y salesOrders[*] comparten hijos como "id", "status", "total" incluso cuando
  // los nombres del contenedor son completamente distintos.
  // Capped en 0.35 (forzado en valueSimilarity) para que esta señal sola no lleve un par
  // a auto-accept — solo complementa la señal léxica/estructural.
  if (counts.size === 0) {
    const childKeys =
      node.children
        ? Object.keys(node.children)
        : node.itemSchema?.children
          ? Object.keys(node.itemSchema.children)
          : [];
    for (const key of childKeys) {
      const k = key.toLowerCase();
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
  }

  const total = node.examples.length;
  const unique = counts.size;
  const entropy = shannonEntropy(counts, total === 0 ? counts.size : total);
  return { total: total === 0 && counts.size > 0 ? counts.size : total, unique, entropy, counts };
}

function valueSimilarity(nodeA: SchemaNode | null, nodeB: SchemaNode | null, weights: Map<string, number>): number {
  if (!nodeA || !nodeB) return 0;

  const profileA = buildValueProfile(nodeA);
  const profileB = buildValueProfile(nodeB);
  if (profileA.total === 0 || profileB.total === 0) return 0;

  // Detectar si ambos perfiles son firmas estructurales (contenedor), no valores reales.
  // Las firmas de contenedor reciben un score amortiguado: máx 0.35 para evitar falsos auto-accept.
  const bothStructural = nodeA.examples.length === 0 && nodeB.examples.length === 0;

  const sharedTokens = [...profileA.counts.keys()].filter(token => profileB.counts.has(token));
  if (sharedTokens.length === 0) return 0;

  let overlapCount = 0;
  let overlapInformation = 0;
  for (const token of sharedTokens) {
    const overlap = Math.min(profileA.counts.get(token) ?? 0, profileB.counts.get(token) ?? 0);
    overlapCount += overlap;
    overlapInformation += intrinsicTokenInformation(token) * overlap;
  }

  const overlapRatio = overlapCount / Math.max(profileA.total, profileB.total);
  const overlapQuality = overlapCount === 0 ? 0 : overlapInformation / overlapCount;
  const entropyAlignment = 1 - Math.abs(profileA.entropy - profileB.entropy);
  const cardinalityAlignment = Math.min(profileA.unique, profileB.unique) / Math.max(profileA.unique, profileB.unique, 1);
  const diversityAlignment = Math.sqrt(
    Math.min(1, profileA.unique / Math.max(1, profileA.total)) *
    Math.min(1, profileB.unique / Math.max(1, profileB.total))
  );
  const sufficiency = evidenceSufficiency(nodeA, nodeB);
  const reliability = Math.sqrt(valueReliability(nodeA, weights) * valueReliability(nodeB, weights));

  const overlapSignal = Math.sqrt(overlapRatio * overlapQuality);
  const distributionSignal = Math.sqrt(Math.max(0, entropyAlignment) * Math.max(0, cardinalityAlignment));
  const score = overlapSignal * (0.65 + 0.35 * distributionSignal) * Math.max(0.35, diversityAlignment) * sufficiency * reliability;

  // Las firmas de contenedor (sin ejemplos reales) complementan pero nunca impulsan un auto-accept.
  return bothStructural ? Math.min(0.35, clamp01(score)) : clamp01(score);
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
  return path.match(/\[\*\]/g)?.length ?? 0;
}

function pathContext(path: string): PathContext {
  const segments = path
    .split('.')
    .filter(Boolean)
    .map(segment => ({
      raw: segment,
      token: normalizeName(segment.replace(/\[\*\]/g, '')),
      isArray: segment.includes('[*]'),
    }))
    .filter(segment => segment.token.length > 0);

  const leafSegment = segments[segments.length - 1];
  const ancestors = segments.slice(0, -1).map(segment => segment.token);
  const arrayAncestors = segments.filter(segment => segment.isArray).map(segment => segment.token);

  return {
    leaf: leafSegment?.token ?? '',
    ancestors,
    arrayAncestors,
    depth: arrayAncestors.length,
    signature: segments.map(segment => `${segment.token}${segment.isArray ? '[]' : ''}`).join('/'),
  };
}

function longestCommonSubsequenceRatio(left: string[], right: string[]): number {
  if (left.length === 0 || right.length === 0) return 0;
  const dp = Array.from({ length: left.length + 1 }, () => Array(right.length + 1).fill(0));

  for (let row = 1; row <= left.length; row++) {
    for (let col = 1; col <= right.length; col++) {
      dp[row][col] = left[row - 1] === right[col - 1]
        ? dp[row - 1][col - 1] + 1
        : Math.max(dp[row - 1][col], dp[row][col - 1]);
    }
  }

  return dp[left.length][right.length] / Math.max(left.length, right.length);
}

function jaccardTokens(left: string[], right: string[]): number {
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  if (leftSet.size === 0 && rightSet.size === 0) return 1;
  const intersection = [...leftSet].filter(token => rightSet.has(token)).length;
  const union = new Set([...leftSet, ...rightSet]).size;
  return union === 0 ? 0 : intersection / union;
}

function structuralSimilarity(pathA: string, pathB: string): number {
  const contextA = pathContext(pathA);
  const contextB = pathContext(pathB);

  const lineageOverlap = jaccardTokens(contextA.ancestors, contextB.ancestors);
  const orderedLineage = longestCommonSubsequenceRatio(contextA.ancestors, contextB.ancestors);
  const arrayOverlap = jaccardTokens(contextA.arrayAncestors, contextB.arrayAncestors);
  const arrayDepthAlignment = Math.max(0.35, 1 - 0.15 * Math.abs(contextA.depth - contextB.depth));
  const flattenTolerance =
    Math.abs(contextA.depth - contextB.depth) <= 1
      ? 1
      : lineageOverlap >= 0.6 && orderedLineage >= 0.5
        ? 0.72
        : 0.4;

  return clamp01(
    Math.max(
      0.40 * lineageOverlap + 0.25 * orderedLineage + 0.20 * arrayOverlap + 0.15 * arrayDepthAlignment,
      0.55 * flattenTolerance + 0.45 * Math.max(lineageOverlap, orderedLineage),
    )
  );
}

function ontologyEvidence(
  pathA: string,
  pathB: string,
  nodeA: SchemaNode | null,
  nodeB: SchemaNode | null,
  providers: OntologyProvider[],
): number {
  let best = 0;
  for (const provider of providers) {
    const match = provider.match({ pathA, pathB, nodeA, nodeB });
    if (match) {
      best = Math.max(best, match.score);
    }
  }
  return clamp01(best);
}

function lexicalEvidence(pathA: string, pathB: string): Pick<SimilarityScore, 'levenshtein' | 'jaccard' | 'semantic'> & { lexical: number } {
  const left = normalizeName(fieldName(pathA));
  const right = normalizeName(fieldName(pathB));
  const levenshteinScore = levenshteinSimilarity(left, right);
  const jaccardScore = jaccardSimilarity(left, right);
  const semanticScore = semanticSimilarity(left, right);
  const lexicalScore = clamp01(Math.max(
    semanticScore,
    Math.min(1, (levenshteinScore + jaccardScore) / 2 + semanticScore * 0.25),
    Math.min(levenshteinScore, jaccardScore),
  ));

  return {
    levenshtein: levenshteinScore,
    jaccard: jaccardScore,
    semantic: semanticScore,
    lexical: lexicalScore,
  };
}

function deriveConfidence(breakdown: SimilarityEvidenceBreakdown): number {
  const corroboratedName = Math.max(breakdown.lexical, breakdown.ontology);
  const corroboratedType = Math.max(breakdown.businessType, breakdown.ontology);
  const corroboratedValue = Math.min(
    breakdown.value,
    Math.max(0.45, breakdown.structural),
    Math.max(0.35, breakdown.sufficiency),
  );

  if (breakdown.value >= 0.90 && breakdown.structural >= 0.60 && breakdown.sufficiency >= 0.72) {
    return 0.96;
  }
  if (breakdown.value >= 0.80 && corroboratedType >= 0.85 && breakdown.structural >= 0.45 && breakdown.sufficiency >= 0.60) {
    return 0.92;
  }
  if (breakdown.value >= 0.70 && corroboratedType >= 0.95 && breakdown.lexical >= 0.72 && breakdown.structural >= 0.60) {
    return 0.94;
  }
  if (breakdown.value >= 0.70 && breakdown.structural >= 0.80 && breakdown.sufficiency >= 0.70) {
    return 0.86;
  }
  if (breakdown.value >= 0.55 && breakdown.structural >= 0.55 && breakdown.sufficiency >= 0.70) {
    return 0.82;
  }
  if (corroboratedType >= 0.90 && breakdown.value >= 0.18 && breakdown.structural >= 0.55 && breakdown.sufficiency >= 0.70) {
    return 0.82;
  }
  if (corroboratedType >= 0.90 && breakdown.value >= 0.18 && breakdown.structural >= 0.90 && breakdown.sufficiency >= 0.70) {
    return 0.84;
  }
  if (breakdown.value >= 0.72 && corroboratedName >= 0.50 && breakdown.structural >= 0.45) {
    return 0.88;
  }
  if (corroboratedName >= 0.90 && breakdown.structural >= 0.40) {
    return 0.84;
  }
  if (corroboratedType >= 0.92 && breakdown.value >= 0.50 && breakdown.sufficiency >= 0.55) {
    return 0.81;
  }

  return clamp01(Math.max(
    corroboratedValue,
    Math.min(corroboratedName, Math.max(0.35, breakdown.structural)),
    Math.min(
      corroboratedType,
      Math.max(0.30, breakdown.sufficiency),
      Math.max(breakdown.lexical, breakdown.value, breakdown.ontology),
    ),
  ));
}

function comparisonSort(left: CandidateScore, right: CandidateScore): number {
  if (right.score.combined !== left.score.combined) return right.score.combined - left.score.combined;
  if ((right.score.margin ?? 0) !== (left.score.margin ?? 0)) return (right.score.margin ?? 0) - (left.score.margin ?? 0);
  return (right.score.reciprocalMargin ?? 0) - (left.score.reciprocalMargin ?? 0);
}

function bucketKey(type: string, path: string): string {
  return `${type}:${arrayDepth(path)}`;
}

function arrayContextKey(path: string): string {
  return pathContext(path).arrayAncestors.slice(-3).join('/');
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

function buildScore(
  pathA: string,
  pathB: string,
  nodeA: SchemaNode | null,
  nodeB: SchemaNode | null,
  weights: Map<string, number>,
  ontologyProviders: OntologyProvider[],
): SimilarityScore {
  const lexical = lexicalEvidence(pathA, pathB);
  const value = valueSimilarity(nodeA, nodeB, weights);
  const businessType = businessTypeSimilarity(nodeA, nodeB, weights);
  const ontology = ontologyEvidence(pathA, pathB, nodeA, nodeB, ontologyProviders);
  const structural = structuralSimilarity(pathA, pathB);
  const sufficiency = evidenceSufficiency(nodeA, nodeB);

  const evidenceBreakdown: SimilarityEvidenceBreakdown = {
    lexical: lexical.lexical,
    value,
    structural,
    businessType,
    ontology,
    sufficiency,
  };

  return {
    levenshtein: lexical.levenshtein,
    jaccard: lexical.jaccard,
    semantic: lexical.semantic,
    value,
    combined: deriveConfidence(evidenceBreakdown),
    evidenceBreakdown,
    evidenceQuality: sufficiency,
  };
}

export class SimilarityEngine {
  private readonly weights: Map<string, number>;
  private readonly ontologyProviders: OntologyProvider[];
  private readonly decisionPolicy: SimilarityDecisionPolicy;

  constructor(config: SimilarityEngineConfig = {}) {
    this.weights = new Map(Object.entries({
      ...defaultBusinessTypeWeights,
      ...(config.businessTypeWeights ?? {}),
    }));
    this.ontologyProviders = [
      ...defaultOntologyProviders,
      ...(config.ontologyProviders ?? []),
    ];
    this.decisionPolicy = new SimilarityDecisionPolicy(config.decisionPolicy);
  }

  findRenameCandidates(
    removed: FieldDiff[],
    added: FieldDiff[],
    threshold = 0.70,
  ): FieldDiff[] {
    const addedByExactBucket = new Map<string, FieldDiff[]>();
    const addedByDepthBucket = new Map<string, FieldDiff[]>();
    const addedByPrimaryType = new Map<string, FieldDiff[]>();

    for (const addedDiff of added) {
      const primary = primaryType(addedDiff.nodeB);
      const exactKey = `${bucketKey(primary, addedDiff.pathB!)}:${arrayContextKey(addedDiff.pathB!)}`;
      const depthKey = bucketKey(primary, addedDiff.pathB!);
      addedByExactBucket.set(exactKey, [...(addedByExactBucket.get(exactKey) ?? []), addedDiff]);
      addedByDepthBucket.set(depthKey, [...(addedByDepthBucket.get(depthKey) ?? []), addedDiff]);
      addedByPrimaryType.set(primary, [...(addedByPrimaryType.get(primary) ?? []), addedDiff]);
    }

    const comparisons: CandidateScore[] = [];

    for (const removedDiff of removed) {
      const typeA = primaryType(removedDiff.nodeA);
      const exactKey = `${bucketKey(typeA, removedDiff.pathA!)}:${arrayContextKey(removedDiff.pathA!)}`;
      const candidates = new Map<string, FieldDiff>();

      for (const candidate of addedByExactBucket.get(exactKey) ?? []) {
        candidates.set(candidate.pathB!, candidate);
      }
      for (const candidate of addedByDepthBucket.get(bucketKey(typeA, removedDiff.pathA!)) ?? []) {
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

      for (const addedDiff of candidates.values()) {
        comparisons.push({
          pathA: removedDiff.pathA!,
          pathB: addedDiff.pathB!,
          score: buildScore(
            removedDiff.pathA!,
            addedDiff.pathB!,
            removedDiff.nodeA,
            addedDiff.nodeB,
            this.weights,
            this.ontologyProviders,
          ),
          diffA: removedDiff,
          diffB: addedDiff,
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

        const score: SimilarityScore = {
          ...comparison.score,
          margin: Math.max(0, margin),
          reciprocalMargin: Math.max(0, reciprocalMargin),
        };

        return {
          ...comparison,
          score: this.decisionPolicy.annotate(score),
        };
      })
      .filter(comparison =>
        comparison.score.combined >= threshold &&
        comparison.score.decision !== 'reject'
      );

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
    const score = buildScore(nameA, nameB, null, null, this.weights, this.ontologyProviders);
    return this.decisionPolicy.annotate(score);
  }
}

export function createSimilarityEngine(config: SimilarityEngineConfig = {}): SimilarityEngine {
  return new SimilarityEngine(config);
}
