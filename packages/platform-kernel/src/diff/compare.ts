import type {
  ComparisonResult,
  ComparisonRule,
  GenericConflict,
  Severity,
  Snapshot,
  DuplicateGroup,
} from './types.js';

// --- Utilidades -------------------------------------------------------------

function getPath(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((cur, key) => {
    if (cur !== null && typeof cur === 'object') {
      return (cur as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

function numericDiff(a: number, b: number): number {
  const denom = Math.max(Math.abs(a), Math.abs(b));
  if (denom === 0) return 0;
  return Math.abs(a - b) / denom;
}

function severityFromFraction(fraction: number): Severity {
  if (fraction < 0.01) return 'LOW';
  if (fraction < 0.05) return 'MEDIUM';
  if (fraction < 0.20) return 'HIGH';
  return 'CRITICAL';
}

function worstOf(conflicts: GenericConflict[]): Severity | null {
  const order: Severity[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
  let worst = -1;
  for (const c of conflicts) {
    const idx = order.indexOf(c.severity);
    if (idx > worst) worst = idx;
  }
  return worst === -1 ? null : order[worst];
}

// --- API publica ------------------------------------------------------------

/**
 * Compara dos snapshots de entidad campo por campo usando reglas opcionales.
 *
 * Cuando no se pasan reglas, se comparan todos los campos escalares de primer
 * nivel compartidos entre ambos objetos y se generan conflictos `soft_drift`
 * en cada diferencia.
 */
export function compareEntities(
  a: Record<string, unknown>,
  b: Record<string, unknown>,
  rules?: ComparisonRule[],
): ComparisonResult {
  const conflicts: GenericConflict[] = [];

  if (rules && rules.length > 0) {
    for (const rule of rules) {
      if (rule.ignore) continue;
      const valA = getPath(a, rule.field);
      const valB = getPath(b, rule.field);

      if (detectMismatch(valA, valB, rule.tolerance)) {
        const severity = rule.severity ?? (
          typeof valA === 'number' && typeof valB === 'number'
            ? severityFromFraction(numericDiff(valA, valB))
            : 'MEDIUM'
        );
        conflicts.push({
          category: rule.category ?? 'soft_drift',
          field: rule.field,
          valueA: valA,
          valueB: valB,
          severity,
        });
      }
    }
  } else {
    // Modo sin reglas: compara todos los campos escalares compartidos de primer nivel.
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const key of keys) {
      const valA = a[key];
      const valB = b[key];
      if (typeof valA !== typeof valB) continue; // el desajuste de tipo lo decide quien llama
      if (typeof valA === 'object') continue; // salteamos objetos anidados en este modo
      if (detectMismatch(valA, valB)) {
        conflicts.push({
          category: 'soft_drift',
          field: key,
          valueA: valA,
          valueB: valB,
          severity: 'LOW',
        });
      }
    }
  }

  return {
    conflicts,
    hasConflicts: conflicts.length > 0,
    worstSeverity: worstOf(conflicts),
  };
}

/**
 * Devuelve true si `a` y `b` difieren mas alla de la tolerancia opcional.
 *
 * Para numeros, la tolerancia es fraccional (por ejemplo 0.01 = 1%).
 * Para el resto de los tipos se usa igualdad exacta.
 */
export function detectMismatch(a: unknown, b: unknown, tolerance?: number): boolean {
  if (a === b) return false;
  if (typeof a === 'number' && typeof b === 'number') {
    if (tolerance === undefined) return a !== b;
    return numericDiff(a, b) > tolerance;
  }
  // Fechas
  if (a instanceof Date && b instanceof Date) {
    return a.getTime() !== b.getTime();
  }
  return a !== b;
}

/**
 * Compara un payload actual contra una secuencia de snapshots historicos.
 *
 * Devuelve conflictos cuando el valor actual difiere del snapshot mas reciente
 * segun la tolerancia por defecto para campos numericos.
 */
export function detectDrift(
  snapshots: Snapshot[],
  current: Record<string, unknown>,
  rules?: ComparisonRule[],
): ComparisonResult {
  if (snapshots.length === 0) {
    return { conflicts: [], hasConflicts: false, worstSeverity: null };
  }
  const latest = snapshots.sort((x, y) => y.capturedAt.getTime() - x.capturedAt.getTime())[0];
  return compareEntities(latest.payload, current, rules);
}

/**
 * Agrupa una lista de entidades por duplicados probables.
 *
 * Usa una estrategia simple de clave normalizada: entidades que comparten el
 * mismo valor para algun campo llamado 'id', 'sku', 'taxId', 'invoiceNumber'
 * o 'trackingId' se consideran duplicados potenciales.
 */
export function detectDuplicates(entities: Record<string, unknown>[]): DuplicateGroup[] {
  const IDENTITY_FIELDS = ['id', 'sku', 'taxId', 'invoiceNumber', 'trackingId', 'cae'];
  // field:value -> indices into `entities` that have that value
  const groups: Map<string, number[]> = new Map();

  for (let idx = 0; idx < entities.length; idx++) {
    const entity = entities[idx];
    for (const field of IDENTITY_FIELDS) {
      const val = entity[field];
      if (val == null || val === '') continue;
      const key = `${field}:${String(val).toLowerCase().trim()}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(idx);
    }
  }

  const result: DuplicateGroup[] = [];
  // Track canonical sets of duplicate indices so we don't report the same pair
  // multiple times when they share more than one identity field.
  const reportedSets = new Set<string>();

  for (const [key, indices] of groups) {
    if (indices.length < 2) continue;

    // Canonical key: sorted indices joined, independent of which field triggered it
    const setKey = [...new Set(indices)].sort((a, b) => a - b).join(',');
    if (reportedSets.has(setKey)) continue;
    reportedSets.add(setKey);

    const field = key.split(':')[0];
    result.push({
      entities: [...new Set(indices)].map(i => entities[i]),
      confidence: 0.9,
      reason: `shared_${field}`,
    });
  }
  return result;
}
