/**
 * Conflict Resolver
 *
 * Clasifica cada FieldDiff en:
 *   - deterministic
 *   - heuristic
 *   - ambiguous
 *
 * Los rename_candidate ahora se aceptan por score absoluto y por margen relativo
 * contra el segundo mejor candidato.
 */

import { ulid } from 'ulid';
import type {
  CompareOptions,
  ConflictResolverConfig,
  FieldDiff,
  FieldMapping,
  ResolvedConflict,
  TransformSpec,
} from './types.js';
import { TypeResolver } from './type-resolver.js';

const resolver = new TypeResolver();
const AUTO_ACCEPT_THRESHOLD = 0.88;
const HUMAN_REVIEW_THRESHOLD = 0.70;
const MIN_CONFIDENCE_MARGIN = 0.15;

const MONEY_FIELD = /monto|importe|precio|amount|valor|costo|tarifa|total/i;
const LEGACY_FIELD_MAP: Record<string, string> = {
  id_pago: 'payment_id',
  nro_comprobante: 'voucher_number',
  fecha_alta: 'created_at',
  razon_social: 'company_name',
  id_cliente: 'customer_id',
  nro_pedido: 'order_number',
  id_orden: 'order_id',
  cod_producto: 'product_code',
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
): FieldMapping {
  return {
    id: `map_${ulid()}`,
    pathA,
    pathB,
    transform,
    confidence,
    bidirectional: transform.kind === 'identity' || transform.kind === 'rename',
  };
}

function isHighConfidenceRename(
  diff: FieldDiff,
  config: Required<ConflictResolverConfig>,
): boolean {
  if (diff.kind !== 'rename_candidate' || !diff.similarity) return false;

  const combined = diff.similarity.combined;
  const margin = diff.similarity.margin ?? 0;
  const reciprocalMargin = diff.similarity.reciprocalMargin ?? 0;
  const minimumMargin = Math.min(margin, reciprocalMargin);

  if (combined >= 0.98) return true;
  if (combined >= config.autoAcceptThreshold && minimumMargin >= config.minConfidenceMargin) {
    return true;
  }

  return (
    combined >= config.humanReviewThreshold &&
    (diff.similarity.value ?? 0) >= 0.60 &&
    minimumMargin >= Math.max(0.25, config.minConfidenceMargin * 1.7)
  );
}

function resolveDeterministic(
  diff: FieldDiff,
  config: Required<ConflictResolverConfig>,
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
      mapping: makeMapping(null, pathB, transform, 1.0),
      confidence: 1.0,
      llmRequired: false,
    };
  }

  if (kind === 'rename_candidate' && diff.similarity && isHighConfidenceRename(diff, config)) {
    const transform: TransformSpec = {
      kind: 'rename',
      fromPath: pathA,
      toPath: pathB,
      description:
        `Renombrado detectado: "${pathA}" -> "${pathB}" ` +
        `(score ${(diff.similarity.combined * 100).toFixed(0)}%, ` +
        `margen ${(Math.min(diff.similarity.margin ?? 0, diff.similarity.reciprocalMargin ?? 0) * 100).toFixed(0)}%)`,
    };
    return {
      diff,
      resolution: 'deterministic',
      mapping: makeMapping(pathA, pathB, transform, diff.similarity.combined),
      confidence: diff.similarity.combined,
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
        mapping: makeMapping(pathA, pathB, transform, 0.95),
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
        mapping: makeMapping(pathA, pathB, transform, 0.85),
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
        mapping: makeMapping(pathA, pathB, transform, 0.90),
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
      mapping: makeMapping(pathA, pathB, transform, 0.90),
      confidence: 0.90,
      llmRequired: false,
    };
  }

  return null;
}

function resolveHeuristic(
  diff: FieldDiff,
  config: Required<ConflictResolverConfig>,
): ResolvedConflict | null {
  const { kind, nodeA, nodeB, pathA, pathB } = diff;

  if (kind === 'rename_candidate' && diff.similarity) {
    const { combined, margin = 0, reciprocalMargin = 0 } = diff.similarity;
    if (combined >= config.humanReviewThreshold && !isHighConfidenceRename(diff, config)) {
      return {
        diff,
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
        mapping: makeMapping(pathA, pathB, transform, 0.80),
        confidence: 0.80,
        llmRequired: false,
      };
    }
  }

  if (kind === 'field_removed' && pathA) {
    const sourceField = pathA.split('.').pop() ?? pathA;
    const alias = LEGACY_FIELD_MAP[sourceField];
    if (alias) {
      const transform: TransformSpec = {
        kind: 'rename',
        fromPath: pathA,
        toPath: alias,
        description: `Campo legacy "${pathA}" -> campo estandar "${alias}"`,
      };
      return {
        diff,
        resolution: 'heuristic',
        mapping: makeMapping(pathA, alias, transform, 0.75),
        confidence: 0.75,
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
      mapping: makeMapping(pathA, pathB, transform, 0.70),
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
      `Similitud insuficiente (${(diff.similarity.combined * 100).toFixed(0)}%) entre "${pathA}" y "${pathB}". ` +
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
  private readonly config: Required<ConflictResolverConfig>;

  constructor(config: ConflictResolverConfig = {}) {
    this.config = {
      autoAcceptThreshold: config.autoAcceptThreshold ?? AUTO_ACCEPT_THRESHOLD,
      humanReviewThreshold: config.humanReviewThreshold ?? HUMAN_REVIEW_THRESHOLD,
      minConfidenceMargin: config.minConfidenceMargin ?? MIN_CONFIDENCE_MARGIN,
    };
  }

  resolveAll(diffs: FieldDiff[], options?: Partial<CompareOptions>): ResolvedConflict[] {
    const results: ResolvedConflict[] = [];

    for (const diff of diffs) {
      const det = resolveDeterministic(diff, this.config);
      if (det) {
        results.push(det);
        continue;
      }

      const heu = resolveHeuristic(diff, this.config);
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
