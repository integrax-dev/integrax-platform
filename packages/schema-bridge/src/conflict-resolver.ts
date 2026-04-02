/**
 * Conflict Resolver
 *
 * Clasifica cada FieldDiff en:
 *   - deterministic
 *   - heuristic
 *   - ambiguous
 *
 * Los rename_candidate se aceptan por evidencia corroborada y margen relativo.
 */

import type {
  CompareOptions,
  ConflictResolverConfig,
  FieldDiff,
  FieldMapping,
  ResolvedConflict,
  SimilarityScore,
  TransformSpec,
} from './types.js';
import { SimilarityDecisionPolicy } from './similarity-decision-policy.js';
import { TypeResolver } from './type-resolver.js';
import { buildExplanation } from './explain.js';

const resolver = new TypeResolver();
const AUTO_ACCEPT_THRESHOLD = 0.88;
const HUMAN_REVIEW_THRESHOLD = 0.70;
const MIN_CONFIDENCE_MARGIN = 0.15;

const MONEY_FIELD = /monto|importe|precio|amount|valor|costo|tarifa|total/i;

type EffectiveConflictResolverConfig = {
  autoAcceptThreshold: number;
  humanReviewThreshold: number;
  minConfidenceMargin: number;
};

function normalizeType(node: { type: string | string[] }): string {
  if (Array.isArray(node.type)) return node.type.find(t => t !== 'null') ?? 'null';
  return node.type;
}

function makeMapping(
  pathA: string | null,
  pathB: string | null,
  transform: TransformSpec,
  confidence: number,
  decisionReason?: string,
  score?: SimilarityScore,
): FieldMapping {
  return {
    id: `map_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    pathA,
    pathB,
    transform,
    confidence,
    bidirectional: transform.kind === 'identity' || transform.kind === 'rename',
    decisionReason,
    why: score ? buildExplanation(score) : undefined,
  };
}

function isHighConfidenceRename(
  diff: FieldDiff,
  policy: SimilarityDecisionPolicy,
): boolean {
  if (diff.kind !== 'rename_candidate' || !diff.similarity) return false;
  return policy.evaluate(diff.similarity) === 'auto_accept';
}

function resolveDeterministic(
  diff: FieldDiff,
  config: EffectiveConflictResolverConfig,
  policy: SimilarityDecisionPolicy,
): ResolvedConflict | null {
  const { kind, nodeA, nodeB, pathA, pathB } = diff;

  if (kind === 'field_added') {
    const transform: TransformSpec = {
      kind: 'identity',
      fromPath: null,
      toPath: pathB,
      description: `Campo nuevo en Sistema B: "${pathB}" - no requiere mapeo desde A`,
    };
    return {
      diff,
      resolution: 'deterministic',
      mapping: makeMapping(null, pathB, transform, 1.0, 'deterministic:field_added'),
      confidence: 1.0,
      llmRequired: false,
    };
  }

  if (kind === 'rename_candidate' && diff.similarity && isHighConfidenceRename(diff, policy)) {
    const annotated = policy.annotate(diff.similarity);
    const transform: TransformSpec = {
      kind: 'rename',
      fromPath: pathA,
      toPath: pathB,
      description:
        `Renombrado detectado: "${pathA}" -> "${pathB}" ` +
        `(score ${(annotated.combined * 100).toFixed(0)}%, ` +
        `margen ${(Math.min(annotated.margin ?? 0, annotated.reciprocalMargin ?? 0) * 100).toFixed(0)}%)`,
    };
    return {
      diff,
      resolution: 'deterministic',
      mapping: makeMapping(pathA, pathB, transform, annotated.combined, 'deterministic:rename', annotated),
      confidence: annotated.combined,
      llmRequired: false,
    };
  }

  if (kind === 'type_changed' && nodeA && nodeB) {
    const typeA = normalizeType(nodeA);
    const typeB = normalizeType(nodeB);
    const res = resolver.resolve(typeA, typeB, nodeA.format, nodeB.format);

    if (res.compatibility === 'identical' || res.compatibility === 'widening') {
      const transform: TransformSpec = {
        kind: res.coercionFn ? 'coerce_type' : 'identity',
        fromPath: pathA,
        toPath: pathB,
        coercionFn: res.coercionFn ?? undefined,
        description: res.description,
      };
      return {
        diff,
        resolution: 'deterministic',
        mapping: makeMapping(pathA, pathB, transform, 0.95, 'deterministic:type_widening'),
        confidence: 0.95,
        llmRequired: false,
      };
    }

    if (res.compatibility === 'coercible' && !res.lossOfPrecision) {
      const transform: TransformSpec = {
        kind: 'coerce_type',
        fromPath: pathA,
        toPath: pathB,
        coercionFn: res.coercionFn ?? undefined,
        description: res.description,
      };
      return {
        diff,
        resolution: 'deterministic',
        mapping: makeMapping(pathA, pathB, transform, 0.85, 'deterministic:type_widening'),
        confidence: 0.85,
        llmRequired: false,
      };
    }
  }

  if (kind === 'format_changed' && nodeA && nodeB) {
    const res = resolver.resolve(
      normalizeType(nodeA),
      normalizeType(nodeB),
      nodeA.format,
      nodeB.format,
    );
    if (res.compatibility !== 'incompatible') {
      const transform: TransformSpec = {
        kind: 'coerce_type',
        fromPath: pathA,
        toPath: pathB,
        coercionFn: res.coercionFn ?? undefined,
        description: res.description,
      };
      return {
        diff,
        resolution: 'deterministic',
        mapping: makeMapping(pathA, pathB, transform, 0.90, 'deterministic:format_coerce'),
        confidence: 0.90,
        llmRequired: false,
      };
    }
  }

  if (kind === 'nullability_changed') {
    const transform: TransformSpec = {
      kind: 'identity',
      fromPath: pathA,
      toPath: pathB,
      description: `Cambio de obligatoriedad en "${pathA}" - agregar manejo de null`,
    };
    return {
      diff,
      resolution: 'deterministic',
      mapping: makeMapping(pathA, pathB, transform, 0.90, 'deterministic:nullability'),
      confidence: 0.90,
      llmRequired: false,
    };
  }

  return null;
}

function resolveHeuristic(
  diff: FieldDiff,
  config: EffectiveConflictResolverConfig,
  policy: SimilarityDecisionPolicy,
): ResolvedConflict | null {
  const { kind, nodeA, nodeB, pathA, pathB } = diff;

  if (kind === 'rename_candidate' && diff.similarity) {
    const similarity = diff.similarity.decision
      ? diff.similarity
      : policy.annotate(diff.similarity);
    const { combined, margin = 0, reciprocalMargin = 0 } = similarity;
    if (
      combined >= config.humanReviewThreshold &&
      similarity.decision === 'review' &&
      !isHighConfidenceRename({ ...diff, similarity }, policy)
    ) {
      return {
        diff: { ...diff, similarity },
        resolution: 'heuristic',
        mapping: null,
        confidence: combined,
        llmRequired: true,
        llmReason:
          `Score intermedio (${(combined * 100).toFixed(0)}%) entre "${pathA}" y "${pathB}". ` +
          `Margen source ${(margin * 100).toFixed(0)}%, margen target ${(reciprocalMargin * 100).toFixed(0)}%. ` +
          'Requiere revision humana/LLM antes de auto-aceptar el renombrado.',
      };
    }
  }

  if (kind === 'type_changed' && nodeA && nodeB && pathA) {
    const isMoneyField = MONEY_FIELD.test(pathA) || MONEY_FIELD.test(pathB ?? '');
    const typeA = normalizeType(nodeA);
    const typeB = normalizeType(nodeB);
    const res = resolver.resolve(typeA, typeB, nodeA.format, nodeB.format);

    if (isMoneyField && res.compatibility !== 'incompatible') {
      const coercionFn = res.coercionFn ??
        (typeA === 'string' && typeB === 'number'
          ? "parseFloat(v.replace(/\\./g, '').replace(',', '.'))"
          : 'Number(v)');
      const transform: TransformSpec = {
        kind: 'coerce_type',
        fromPath: pathA,
        toPath: pathB,
        coercionFn,
        description: `Campo monetario: conversion ${typeA}->${typeB} en "${pathA}"`,
      };
      return {
        diff,
        resolution: 'heuristic',
        mapping: makeMapping(pathA, pathB, transform, 0.80, 'heuristic:money_coerce'),
        confidence: 0.80,
        llmRequired: false,
      };
    }
  }

  if (kind === 'constraint_changed') {
    const transform: TransformSpec = {
      kind: 'identity',
      fromPath: pathA,
      toPath: pathB,
      description: `Cambio de restricciones/enum en "${pathA}" - validar valores posibles`,
    };
    return {
      diff,
      resolution: 'heuristic',
      mapping: makeMapping(pathA, pathB, transform, 0.70, 'heuristic:constraint_changed'),
      confidence: 0.70,
      llmRequired: false,
    };
  }

  return null;
}

function resolveAmbiguous(diff: FieldDiff): ResolvedConflict {
  let reason = '';
  const { kind, nodeA, nodeB, pathA, pathB } = diff;

  if (kind === 'type_changed' && nodeA && nodeB) {
    const typeA = normalizeType(nodeA);
    const typeB = normalizeType(nodeB);
    const res = resolver.resolve(typeA, typeB, nodeA.format, nodeB.format);
    if (res.compatibility === 'incompatible') {
      reason = `Tipos incompatibles "${typeA}" -> "${typeB}" en campo "${pathA}". No existe conversion automatica conocida.`;
    } else {
      reason = `Conversion con perdida de precision de "${typeA}" a "${typeB}" en "${pathA}".`;
    }
  } else if (kind === 'field_removed') {
    reason = `Campo "${pathA}" eliminado en Sistema B sin candidato de renombrado. Verificar si fue eliminado, renombrado o movido.`;
  } else if (kind === 'rename_candidate' && diff.similarity) {
    reason =
      `Evidencia insuficiente (${(diff.similarity.combined * 100).toFixed(0)}%) entre "${pathA}" y "${pathB}". ` +
      `Decision propuesta: ${diff.similarity.decision ?? 'reject'}. ` +
      `Margen source ${((diff.similarity.margin ?? 0) * 100).toFixed(0)}%, ` +
      `margen target ${((diff.similarity.reciprocalMargin ?? 0) * 100).toFixed(0)}%.`;
  } else {
    reason = `Diferencia no resuelta entre "${pathA}" y "${pathB}" - requiere analisis manual.`;
  }

  return {
    diff,
    resolution: 'ambiguous',
    mapping: null,
    confidence: 0.0,
    llmRequired: true,
    llmReason: reason,
  };
}

export class ConflictResolver {
  private readonly config: EffectiveConflictResolverConfig;
  private readonly policy: SimilarityDecisionPolicy;

  constructor(config: ConflictResolverConfig = {}) {
    this.config = {
      autoAcceptThreshold: config.autoAcceptThreshold ?? AUTO_ACCEPT_THRESHOLD,
      humanReviewThreshold: config.humanReviewThreshold ?? HUMAN_REVIEW_THRESHOLD,
      minConfidenceMargin: config.minConfidenceMargin ?? MIN_CONFIDENCE_MARGIN,
    };
    this.policy = new SimilarityDecisionPolicy(config.decisionPolicy ?? {
      autoAcceptThreshold: this.config.autoAcceptThreshold,
      reviewThreshold: this.config.humanReviewThreshold,
      minConfidenceMargin: this.config.minConfidenceMargin,
    });
  }

  resolveAll(diffs: FieldDiff[], options?: Partial<CompareOptions>): ResolvedConflict[] {
    const results: ResolvedConflict[] = [];

    for (const diff of diffs) {
      const det = resolveDeterministic(diff, this.config, this.policy);
      if (det) {
        results.push(det);
        continue;
      }

      const heu = resolveHeuristic(diff, this.config, this.policy);
      if (heu) {
        results.push(heu);
        continue;
      }

      results.push(resolveAmbiguous(diff));
    }

    return results;
  }
}

export function createConflictResolver(config: ConflictResolverConfig = {}): ConflictResolver {
  return new ConflictResolver(config);
}
