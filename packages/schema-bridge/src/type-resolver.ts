/**
 * Type Resolver
 *
 * Matriz de compatibilidad de tipos entre Schema A y Schema B.
 * Función pura — sin I/O, sin LLM.
 */

import type { TypeCompatibility, TypeResolution } from './types.js';

// ─── Llave de lookup ──────────────────────────────────────────────────────────

function key(fromType: string, toType: string, fromFmt?: string, toFmt?: string): string {
  return `${fromType}:${fromFmt ?? ''}→${toType}:${toFmt ?? ''}`;
}

// ─── Tabla de compatibilidad ──────────────────────────────────────────────────

type MatrixEntry = Omit<TypeResolution, 'description'>;

const MATRIX: Map<string, MatrixEntry> = new Map([
  // Idénticos
  [key('string', 'string'), { compatibility: 'identical', coercionFn: null, requiresValidation: false, lossOfPrecision: false }],
  [key('number', 'number'), { compatibility: 'identical', coercionFn: null, requiresValidation: false, lossOfPrecision: false }],
  [key('boolean', 'boolean'), { compatibility: 'identical', coercionFn: null, requiresValidation: false, lossOfPrecision: false }],
  [key('null', 'null'), { compatibility: 'identical', coercionFn: null, requiresValidation: false, lossOfPrecision: false }],
  [key('object', 'object'), { compatibility: 'identical', coercionFn: null, requiresValidation: false, lossOfPrecision: false }],
  [key('array', 'array'), { compatibility: 'identical', coercionFn: null, requiresValidation: false, lossOfPrecision: false }],

  // number → string (widening — siempre seguro)
  [key('number', 'string'), { compatibility: 'widening', coercionFn: 'String(v)', requiresValidation: false, lossOfPrecision: false }],
  [key('number', 'string', 'int64'), { compatibility: 'widening', coercionFn: 'String(v)', requiresValidation: false, lossOfPrecision: false }],
  [key('number', 'string', 'double'), { compatibility: 'widening', coercionFn: 'String(v)', requiresValidation: false, lossOfPrecision: false }],

  // boolean → string (widening)
  [key('boolean', 'string'), { compatibility: 'widening', coercionFn: 'String(v)', requiresValidation: false, lossOfPrecision: false }],

  // int64 → double (widening)
  [key('number', 'number', 'int64', 'double'), { compatibility: 'widening', coercionFn: null, requiresValidation: false, lossOfPrecision: false }],

  // double → int64 (narrowing — pérdida de precisión posible)
  [key('number', 'number', 'double', 'int64'), { compatibility: 'narrowing', coercionFn: 'Math.round(v)', requiresValidation: false, lossOfPrecision: true }],

  // string → number (coercible — puede fallar)
  [key('string', 'number'), { compatibility: 'coercible', coercionFn: 'Number(v)', requiresValidation: true, lossOfPrecision: false }],

  // string → boolean (coercible)
  [key('string', 'boolean'), { compatibility: 'coercible', coercionFn: "v === 'true' || v === '1'", requiresValidation: true, lossOfPrecision: false }],

  // date → date-time (widening)
  [key('string', 'string', 'date', 'date-time'), { compatibility: 'widening', coercionFn: "v + 'T00:00:00Z'", requiresValidation: false, lossOfPrecision: false }],

  // date-time → date (narrowing)
  [key('string', 'string', 'date-time', 'date'), { compatibility: 'narrowing', coercionFn: 'v.slice(0, 10)', requiresValidation: false, lossOfPrecision: true }],

  // ar-cuit → string (widening — CUIT es un subtipo de string)
  [key('string', 'string', 'ar-cuit', undefined), { compatibility: 'widening', coercionFn: null, requiresValidation: false, lossOfPrecision: false }],
  [key('string', 'string', 'ar-cuit', ''), { compatibility: 'widening', coercionFn: null, requiresValidation: false, lossOfPrecision: false }],

  // string → ar-cuit (coercible — necesita validación)
  [key('string', 'string', undefined, 'ar-cuit'), { compatibility: 'coercible', coercionFn: null, requiresValidation: true, lossOfPrecision: false }],
  [key('string', 'string', '', 'ar-cuit'), { compatibility: 'coercible', coercionFn: null, requiresValidation: true, lossOfPrecision: false }],

  // ar-money-string → number (coercible — parseFloat)
  [key('string', 'number', 'ar-money-string'), { compatibility: 'coercible', coercionFn: "parseFloat(v.replace(/\\./g, '').replace(',', '.'))", requiresValidation: true, lossOfPrecision: false }],
  [key('string', 'number', 'ar-money-string', 'double'), { compatibility: 'coercible', coercionFn: "parseFloat(v.replace(/\\./g, '').replace(',', '.'))", requiresValidation: true, lossOfPrecision: false }],

  // number → ar-money-string (widening)
  [key('number', 'string', undefined, 'ar-money-string'), { compatibility: 'widening', coercionFn: 'v.toFixed(2)', requiresValidation: false, lossOfPrecision: false }],

  // Incompatibles
  [key('array', 'object'), { compatibility: 'incompatible', coercionFn: null, requiresValidation: false, lossOfPrecision: false }],
  [key('object', 'array'), { compatibility: 'incompatible', coercionFn: null, requiresValidation: false, lossOfPrecision: false }],
  [key('string', 'object'), { compatibility: 'incompatible', coercionFn: null, requiresValidation: false, lossOfPrecision: false }],
  [key('object', 'string'), { compatibility: 'incompatible', coercionFn: null, requiresValidation: false, lossOfPrecision: false }],
  [key('string', 'array'), { compatibility: 'incompatible', coercionFn: null, requiresValidation: false, lossOfPrecision: false }],
  [key('array', 'string'), { compatibility: 'incompatible', coercionFn: null, requiresValidation: false, lossOfPrecision: false }],
]);

function describeResolution(r: MatrixEntry, fromType: string, toType: string): string {
  switch (r.compatibility) {
    case 'identical': return `Tipos idénticos (${fromType}) — sin transformación necesaria`;
    case 'widening': return `Ampliación segura de ${fromType} a ${toType}${r.coercionFn ? ` usando ${r.coercionFn}` : ''}`;
    case 'narrowing': return `Reducción con posible pérdida de ${fromType} a ${toType}${r.lossOfPrecision ? ' (pérdida de precisión posible)' : ''}`;
    case 'coercible': return `Conversión requerida de ${fromType} a ${toType} usando ${r.coercionFn ?? 'validación manual'}`;
    case 'incompatible': return `Incompatible: no existe conversión automática entre ${fromType} y ${toType}`;
  }
}

// ─── TypeResolver ─────────────────────────────────────────────────────────────

export class TypeResolver {
  resolve(
    fromType: string,
    toType: string,
    fromFormat?: string,
    toFormat?: string,
  ): TypeResolution {
    // Intentar lookup específico con formatos
    const entry =
      MATRIX.get(key(fromType, toType, fromFormat, toFormat)) ??
      MATRIX.get(key(fromType, toType, fromFormat)) ??
      MATRIX.get(key(fromType, toType, undefined, toFormat)) ??
      MATRIX.get(key(fromType, toType));

    if (entry) {
      return { ...entry, description: describeResolution(entry, fromType, toType) };
    }

    // Si tipos son iguales pero formatos distintos (fallback)
    if (fromType === toType) {
      const fallback: MatrixEntry = { compatibility: 'coercible', coercionFn: null, requiresValidation: true, lossOfPrecision: false };
      return { ...fallback, description: `Mismo tipo ${fromType} con formatos distintos (${fromFormat ?? 'sin formato'} → ${toFormat ?? 'sin formato'})` };
    }

    // Default incompatible
    const incompatible: MatrixEntry = { compatibility: 'incompatible', coercionFn: null, requiresValidation: false, lossOfPrecision: false };
    return { ...incompatible, description: `Sin regla de conversión entre ${fromType} y ${toType}` };
  }

  /**
   * Calcula un "breaking score" (0.0–1.0) basado en la compatibilidad.
   */
  toBreakingScore(compatibility: TypeCompatibility): number {
    switch (compatibility) {
      case 'identical': return 0.0;
      case 'widening': return 0.1;
      case 'coercible': return 0.3;
      case 'narrowing': return 0.6;
      case 'incompatible': return 0.9;
    }
  }
}

export function createTypeResolver(): TypeResolver {
  return new TypeResolver();
}
