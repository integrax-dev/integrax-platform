/**
 * Composite Mapper
 *
 * Detecta heurísticamente mappings 1:N (split) y N:1 (merge) entre campos
 * que el engine 1:1 deja sin resolver (field_removed + field_added huérfanos).
 *
 * Estrategia:
 *   Split: un campo fuente largo se corresponde con N campos destino cuyo
 *     conjunto de tokens cubre los tokens del campo fuente.
 *     Ejemplo: full_name → first_name + last_name
 *
 *   Merge: N campos fuente cuyos tokens cubiertos por un campo destino.
 *     Ejemplo: amount + currency → money_amount
 *
 * No genera código complejo ni usa AST. Los TransformSpec resultantes
 * son interpretados por el MappingGenerator para generar TS seguro.
 */

import type {
  CompositeMapping,
  FieldDiff,
  TransformSpec,
} from './types.js';

// ─── Constantes ───────────────────────────────────────────────────────────────

/**
 * Pares canónicos de split conocidos. Si el campo fuente coincide con la clave
 * y los campos destino con el valor, se usa la estrategia 'space'.
 */
const KNOWN_SPLITS: Array<{ from: string; to: string[]; strategy: 'space' | 'regex'; regex?: string }> = [
  { from: 'full_name', to: ['first_name', 'last_name'], strategy: 'space' },
  { from: 'fullname', to: ['firstname', 'lastname'], strategy: 'space' },
  { from: 'name', to: ['first_name', 'last_name'], strategy: 'space' },
  { from: 'address', to: ['street', 'city', 'state', 'zip'], strategy: 'regex', regex: ',\\s*' },
  { from: 'phone', to: ['country_code', 'local_number'], strategy: 'regex', regex: '[\\s-]' },
];

/**
 * Pares canónicos de merge conocidos.
 */
const KNOWN_MERGES: Array<{ from: string[]; to: string; strategy: 'object' | 'concat' }> = [
  { from: ['amount', 'currency'], to: 'money', strategy: 'object' },
  { from: ['price', 'currency'], to: 'money', strategy: 'object' },
  { from: ['amount', 'currency'], to: 'price', strategy: 'object' },
  { from: ['first_name', 'last_name'], to: 'full_name', strategy: 'concat' },
  { from: ['firstname', 'lastname'], to: 'fullname', strategy: 'concat' },
  { from: ['street', 'city', 'state', 'zip'], to: 'address', strategy: 'concat' },
];

const MIN_COMPOSITE_CONFIDENCE = 0.65;

// ─── Normalización ─────────────────────────────────────────────────────────────

function normalize(path: string): string {
  return path
    .split('.').pop()!
    .replace(/\[\*\]/g, '')
    .replace(/([A-Z])/g, '_$1')
    .replace(/-/g, '_')
    .toLowerCase()
    .replace(/__+/g, '_')
    .replace(/^_|_$/g, '');
}

function tokens(name: string): string[] {
  return normalize(name).split('_').filter(Boolean);
}

/**
 * Cobertura de tokens: qué fracción de los tokens de `target` están en `source`.
 */
function tokenCoverage(sourceName: string, targetTokens: string[]): number {
  const src = new Set(tokens(sourceName));
  const covered = targetTokens.filter(t => src.has(t)).length;
  return targetTokens.length === 0 ? 0 : covered / targetTokens.length;
}

// ─── Detección ────────────────────────────────────────────────────────────────

/**
 * Detecta mappings compuestos entre campos huérfanos (field_removed / field_added).
 *
 * @param removed - Campos presentes en A pero no en B (field_removed)
 * @param added   - Campos presentes en B pero no en A (field_added)
 */
export function detectCompositeMappings(
  removed: FieldDiff[],
  added: FieldDiff[],
): CompositeMapping[] {
  const results: CompositeMapping[] = [];

  const removedPaths = removed.map(d => d.pathA!).filter(Boolean);
  const addedPaths = added.map(d => d.pathB!).filter(Boolean);

  // ── 1. Split: un campo removed → N campos added ──────────────────────────

  for (const fromPath of removedPaths) {
    const fromNorm = normalize(fromPath);

    // a) Conocidos canónicos primero
    for (const known of KNOWN_SPLITS) {
      if (normalize(known.from) !== fromNorm) continue;
      const matchedTo = known.to
        .map(t => addedPaths.find(p => normalize(p) === normalize(t)))
        .filter((p): p is string => p != null);

      if (matchedTo.length < 2) continue;

      const confidence = matchedTo.length / known.to.length >= 0.75 ? 0.88 : 0.72;
      if (confidence < MIN_COMPOSITE_CONFIDENCE) continue;

      const transform: TransformSpec = {
        kind: 'split',
        fromPath,
        toPath: matchedTo[0],
        toPaths: matchedTo,
        splitStrategy: known.strategy,
        splitRegex: known.regex,
        description: `Split ${fromPath} → ${matchedTo.join(' + ')}`,
      };
      results.push({
        kind: 'split',
        fromPaths: [fromPath],
        toPaths: matchedTo,
        transform,
        confidence,
        reason: `El campo '${fromNorm}' se corresponde con ${matchedTo.map(p => `'${normalize(p)}'`).join(' + ')} (split canónico)`,
      });
      break;
    }

    // b) Heurística por cobertura de tokens
    if (results.some(r => r.kind === 'split' && r.fromPaths[0] === fromPath)) continue;
    const fromTokens = tokens(fromPath);
    if (fromTokens.length < 2) continue; // campo de 1 token no tiene sentido splitear

    const covered = addedPaths.filter(p => {
      const pTokens = tokens(p);
      return pTokens.some(t => fromTokens.includes(t));
    });

    if (covered.length < 2) continue;

    // Los tokens de todos los candidatos deben cubrir al menos el 80% de los tokens del fuente
    const allCoveredTokens = new Set(covered.flatMap(p => tokens(p)));
    const coverage = fromTokens.filter(t => allCoveredTokens.has(t)).length / fromTokens.length;
    if (coverage < 0.8) continue;

    const confidence = Math.min(0.82, 0.60 + coverage * 0.25);
    const transform: TransformSpec = {
      kind: 'split',
      fromPath,
      toPath: covered[0],
      toPaths: covered,
      splitStrategy: 'space',
      description: `Split heurístico ${fromPath} → ${covered.join(' + ')}`,
    };
    results.push({
      kind: 'split',
      fromPaths: [fromPath],
      toPaths: covered,
      transform,
      confidence,
      reason: `Los tokens de '${fromNorm}' están distribuidos entre ${covered.map(p => `'${normalize(p)}'`).join(', ')}`,
    });
  }

  // ── 2. Merge: N campos removed → 1 campo added ───────────────────────────

  for (const toPath of addedPaths) {
    const toNorm = normalize(toPath);

    // a) Conocidos canónicos
    for (const known of KNOWN_MERGES) {
      if (normalize(known.to) !== toNorm) continue;
      const matchedFrom = known.from
        .map(f => removedPaths.find(p => normalize(p) === normalize(f)))
        .filter((p): p is string => p != null);

      if (matchedFrom.length < 2) continue;

      const confidence = matchedFrom.length / known.from.length >= 0.75 ? 0.88 : 0.72;
      if (confidence < MIN_COMPOSITE_CONFIDENCE) continue;

      const transform: TransformSpec = {
        kind: 'merge',
        fromPath: matchedFrom[0],
        toPath,
        fromPaths: matchedFrom,
        mergeStrategy: known.strategy,
        mergeSeparator: known.strategy === 'concat' ? ' ' : undefined,
        description: `Merge ${matchedFrom.join(' + ')} → ${toPath}`,
      };
      results.push({
        kind: 'merge',
        fromPaths: matchedFrom,
        toPaths: [toPath],
        transform,
        confidence,
        reason: `Los campos ${matchedFrom.map(p => `'${normalize(p)}'`).join(' + ')} se combinan en '${toNorm}' (merge canónico)`,
      });
      break;
    }

    // b) Heurística: N campos removed cuya unión de tokens cubre los del destino
    if (results.some(r => r.kind === 'merge' && r.toPaths[0] === toPath)) continue;
    const toTokens = tokens(toPath);
    if (toTokens.length < 2) continue;

    const contributors = removedPaths.filter(p => {
      const pTokens = tokens(p);
      return pTokens.some(t => toTokens.includes(t));
    });

    if (contributors.length < 2) continue;

    const allContribTokens = new Set(contributors.flatMap(p => tokens(p)));
    const coverage = toTokens.filter(t => allContribTokens.has(t)).length / toTokens.length;
    if (coverage < 0.8) continue;

    const confidence = Math.min(0.82, 0.60 + coverage * 0.25);
    const transform: TransformSpec = {
      kind: 'merge',
      fromPath: contributors[0],
      toPath,
      fromPaths: contributors,
      mergeStrategy: 'object',
      description: `Merge heurístico ${contributors.join(' + ')} → ${toPath}`,
    };
    results.push({
      kind: 'merge',
      fromPaths: contributors,
      toPaths: [toPath],
      transform,
      confidence,
      reason: `Los tokens de '${toNorm}' están cubiertos por ${contributors.map(p => `'${normalize(p)}'`).join(' + ')}`,
    });
  }

  return results;
}
