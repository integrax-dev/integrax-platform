/**
 * Conflict Resolver
 *
 * Clasifica cada FieldDiff en:
 *   - 'deterministic': resuelto algorítmicamente (sin LLM)
 *   - 'heuristic': resuelto por patrones de dominio LatAm (sin LLM)
 *   - 'ambiguous': escalación a LLM necesaria
 *
 * El LLM solo se invoca si enableLlmEscalation=true Y el SDK está disponible.
 */

import { ulid } from 'ulid';
import type {
  CompareOptions,
  ConflictClass,
  FieldDiff,
  FieldMapping,
  ResolvedConflict,
  TransformSpec,
} from './types.js';
import { TypeResolver } from './type-resolver.js';

const resolver = new TypeResolver();

// Patrones de campos monetarios para heurísticas
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

// ─── Resolución por tier ──────────────────────────────────────────────────────

function resolveDeterministic(diff: FieldDiff): ResolvedConflict | null {
  const { kind, nodeA, nodeB, pathA, pathB } = diff;

  // Campos nuevos en B — siempre determinístico (no rompen)
  if (kind === 'field_added') {
    const transform: TransformSpec = {
      kind: 'identity',
      fromPath: null,
      toPath: pathB,
      description: `Campo nuevo en Sistema B: "${pathB}" — no requiere mapeo desde A`,
    };
    return {
      diff,
      resolution: 'deterministic',
      mapping: makeMapping(null, pathB, transform, 1.0),
      confidence: 1.0,
      llmRequired: false,
    };
  }

  // rename_candidate con alta confianza (≥0.85)
  if (kind === 'rename_candidate' && diff.similarity && diff.similarity.combined >= 0.85) {
    const transform: TransformSpec = {
      kind: 'rename',
      fromPath: pathA,
      toPath: pathB,
      description: `Renombrado detectado: "${pathA}" → "${pathB}" (similitud: ${(diff.similarity.combined * 100).toFixed(0)}%)`,
    };
    return {
      diff,
      resolution: 'deterministic',
      mapping: makeMapping(pathA, pathB, transform, diff.similarity.combined),
      confidence: diff.similarity.combined,
      llmRequired: false,
    };
  }

  // type_changed — revisar compatibilidad
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

  // format_changed date/date-time
  if (kind === 'format_changed' && nodeA && nodeB) {
    const res = resolver.resolve(
      normalizeType(nodeA), normalizeType(nodeB),
      nodeA.format, nodeB.format,
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

  // nullability_changed (required→optional) — no breaking
  if (kind === 'nullability_changed') {
    const transform: TransformSpec = {
      kind: 'identity',
      fromPath: pathA,
      toPath: pathB,
      description: `Cambio de obligatoriedad en "${pathA}" — agregar manejo de null`,
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

function resolveHeuristic(diff: FieldDiff): ResolvedConflict | null {
  const { kind, nodeA, nodeB, pathA, pathB } = diff;

  // rename_candidate con confianza media (0.70–0.84)
  if (kind === 'rename_candidate' && diff.similarity) {
    const { combined } = diff.similarity;
    if (combined >= 0.70 && combined < 0.85) {
      const transform: TransformSpec = {
        kind: 'rename',
        fromPath: pathA,
        toPath: pathB,
        description: `Posible renombrado: "${pathA}" → "${pathB}" (similitud: ${(combined * 100).toFixed(0)}%) — verificar manualmente`,
      };
      return {
        diff,
        resolution: 'heuristic',
        mapping: makeMapping(pathA, pathB, transform, combined),
        confidence: combined,
        llmRequired: false,
      };
    }
  }

  // type_changed con coerción monetaria LatAm
  if (kind === 'type_changed' && nodeA && nodeB && pathA) {
    const isMoneyField = MONEY_FIELD.test(pathA) || MONEY_FIELD.test(pathB ?? '');
    const typeA = normalizeType(nodeA);
    const typeB = normalizeType(nodeB);
    const res = resolver.resolve(typeA, typeB, nodeA.format, nodeB.format);

    if (isMoneyField && res.compatibility !== 'incompatible') {
      const coercionFn = res.coercionFn ??
        (typeA === 'string' && typeB === 'number' ? "parseFloat(v.replace(/\\./g, '').replace(',', '.'))" : 'Number(v)');
      const transform: TransformSpec = {
        kind: 'coerce_type',
        fromPath: pathA,
        toPath: pathB,
        coercionFn,
        description: `Campo monetario: conversión ${typeA}→${typeB} en "${pathA}"`,
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

  // field_removed que coincide con un campo legacy conocido
  if (kind === 'field_removed' && pathA) {
    const fieldName = pathA.split('.').pop() ?? pathA;
    const alias = LEGACY_FIELD_MAP[fieldName];
    if (alias) {
      const transform: TransformSpec = {
        kind: 'rename',
        fromPath: pathA,
        toPath: alias,
        description: `Campo legacy "${pathA}" → campo estándar "${alias}"`,
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

  // constraint_changed — heurística: informacional
  if (kind === 'constraint_changed') {
    const transform: TransformSpec = {
      kind: 'identity',
      fromPath: pathA,
      toPath: pathB,
      description: `Cambio de restricciones/enum en "${pathA}" — validar valores posibles`,
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
      reason = `Tipos incompatibles "${typeA}" → "${typeB}" en campo "${pathA}". No existe conversión automática conocida.`;
    } else {
      reason = `Conversión con pérdida de precisión de "${typeA}" a "${typeB}" en "${pathA}".`;
    }
  } else if (kind === 'field_removed') {
    reason = `Campo "${pathA}" eliminado en Sistema B sin candidato de renombrado. Verificar si fue eliminado, renombrado o movido.`;
  } else if (kind === 'rename_candidate' && diff.similarity) {
    reason = `Similitud baja (${(diff.similarity.combined * 100).toFixed(0)}%) entre "${pathA}" y "${pathB}". Confirmar si es renombrado o coincidencia falsa.`;
  } else {
    reason = `Diferencia no resuelta entre "${pathA}" y "${pathB}" — requiere análisis manual.`;
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

// ─── ConflictResolver ─────────────────────────────────────────────────────────

export class ConflictResolver {
  resolveAll(diffs: FieldDiff[], options?: Partial<CompareOptions>): ResolvedConflict[] {
    const results: ResolvedConflict[] = [];

    for (const diff of diffs) {
      // Tier 1: Determinístico
      const det = resolveDeterministic(diff);
      if (det) { results.push(det); continue; }

      // Tier 2: Heurístico
      const heu = resolveHeuristic(diff);
      if (heu) { results.push(heu); continue; }

      // Tier 3: Ambiguo
      results.push(resolveAmbiguous(diff));
    }

    return results;
  }
}

export function createConflictResolver(): ConflictResolver {
  return new ConflictResolver();
}
