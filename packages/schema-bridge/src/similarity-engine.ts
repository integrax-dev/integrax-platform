/**
 * Similarity Engine
 *
 * Detects renamed fields between two schemas using:
 * 1. Levenshtein distance (normalized)
 * 2. Jaccard over trigrams
 * 3. LatAm domain synonym table — generic Spanish/English pairs only (no connector-specific entries)
 * 4. Value-based matching — Jaccard over distinctive sample values (primary signal for unknown connectors)
 *
 * Type-bucketing reduces comparisons from O(n²) to O(n × avg_bucket_size) by only comparing
 * fields of compatible types as rename candidates.
 *
 * Pure function — no I/O, no LLM.
 */

import type { FieldDiff, SchemaNode, SimilarityScore } from './types.js';

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

// ─── Value similarity ─────────────────────────────────────────────────────────

/**
 * Returns true for values that are distinctive enough to be trusted as field identity signals.
 * Filters out purely numeric values ("1000", "42") — they appear frequently across unrelated
 * fields (IDs, amounts, codes) and produce false positives with small sample sets.
 * Accepts short alphabetic codes (e.g. "EUR", "USD", "AR") since their combination across
 * multiple samples is sufficiently distinctive.
 */
function isDistinctiveValue(v: string): boolean {
  return v.length >= 3 && !/^\d+$/.test(v);
}

/**
 * Jaccard similarity over distinctive sample values from two schema nodes.
 * High overlap means both fields hold the same real-world data → strong rename signal.
 */
function valueSimilarity(nodeA: SchemaNode | null, nodeB: SchemaNode | null): number {
  if (!nodeA || !nodeB) return 0;
  const exA = new Set(
    nodeA.examples
      .map(v => String(v ?? '').toLowerCase().trim())
      .filter(isDistinctiveValue),
  );
  const exB = new Set(
    nodeB.examples
      .map(v => String(v ?? '').toLowerCase().trim())
      .filter(isDistinctiveValue),
  );
  if (exA.size === 0 || exB.size === 0) return 0;
  const intersection = [...exA].filter(v => exB.has(v)).length;
  const union = new Set([...exA, ...exB]).size;
  return intersection / union;
}

// ─── Score combinado ──────────────────────────────────────────────────────────

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

  // Authoritative shortcuts — no need for weighted average
  //   semantic=1.0 → direct synonym match
  //   value≥0.8   → ≥80% of distinctive sample values are identical across both fields
  const combined =
    sem >= 1.0 || val >= 0.8
      ? 1.0
      : 0.35 * lev + 0.25 * jac + 0.25 * sem + 0.15 * val;

  return { levenshtein: lev, jaccard: jac, semantic: sem, value: val, combined };
}

// ─── SimilarityEngine ─────────────────────────────────────────────────────────

export class SimilarityEngine {
  /**
   * Given field_removed and field_added diffs, returns rename candidates sorted by score desc.
   *
   * Type-bucketing: added fields are grouped by their primary JSON type before the loop.
   * Each removed field only compares against fields of the same type (+ 'unknown' bucket for
   * fields whose type couldn't be determined). Reduces comparisons from O(n²) to
   * O(n × avg_bucket_size) — ~70% fewer comparisons on typical mixed-type schemas.
   *
   * Greedy matching ensures each field appears in at most one rename pair.
   */
  findRenameCandidates(
    removed: FieldDiff[],
    added: FieldDiff[],
    threshold = 0.70,
  ): FieldDiff[] {
    // ── Type-bucketing ────────────────────────────────────────────────────────
    const addedByType = new Map<string, FieldDiff[]>();
    for (const dB of added) {
      const t = primaryType(dB.nodeB);
      const bucket = addedByType.get(t);
      if (bucket) bucket.push(dB);
      else addedByType.set(t, [dB]);
    }

    // ── Score matrix (only within compatible type buckets) ────────────────────
    const scores: Array<{ pathA: string; pathB: string; score: SimilarityScore; diffA: FieldDiff; diffB: FieldDiff }> = [];

    for (const dA of removed) {
      const typeA = primaryType(dA.nodeA);
      const nameA = fieldName(dA.pathA!);

      // Same-type bucket + unknown bucket (undetermined types can match anything)
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
   * Para incluir value similarity, usar findRenameCandidates (que accede a los nodos).
   */
  score(nameA: string, nameB: string): SimilarityScore {
    return combinedScore(nameA, nameB, null, null);
  }
}

function fieldName(path: string): string {
  const parts = path.split('.');
  return parts[parts.length - 1].replace(/\[\*\]$/, '');
}

/** Returns the primary (non-null) JSON type of a schema node, or 'unknown' if unavailable. */
function primaryType(node: SchemaNode | null): string {
  if (!node) return 'unknown';
  if (Array.isArray(node.type)) return node.type.find(t => t !== 'null') ?? 'null';
  return node.type;
}

export function createSimilarityEngine(): SimilarityEngine {
  return new SimilarityEngine();
}
