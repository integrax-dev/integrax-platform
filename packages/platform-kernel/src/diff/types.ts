/**
 * Tipos de diff genericos y agnosticos al esquema.
 *
 * Estas son las categorias semanticas que usa la plataforma para clasificar
 * diferencias entre representaciones de una entidad provenientes de distintos
 * conectores. Se mantienen abstractas a proposito; las etiquetas especificas
 * por entidad viven en `@integrax/reconciliation-engine` y aterrizan sobre
 * estas categorias.
 */

export type ConflictCategory =
  /** Desajuste menor dentro de una tolerancia aceptable (por ejemplo un redondeo). */
  | 'soft_drift'
  /** Desajuste importante que requiere atencion (por ejemplo un delta grande de precio). */
  | 'hard_drift'
  /** Dos registros parecen representar la misma entidad (duplicado potencial). */
  | 'duplicate_identity'
  /** Se incumplio una regla de negocio o de compliance. */
  | 'policy_violation'
  /** Los registros estan en estados distintos del ciclo de vida. */
  | 'state_divergence'
  /** Los montos monetarios divergen por encima del umbral aceptable. */
  | 'financial_conflict';

export type Severity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface GenericConflict {
  category: ConflictCategory;
  /** Path del campo que difiere, si aplica. */
  field?: string;
  /** Valor del origen A. */
  valueA?: unknown;
  /** Valor del origen B. */
  valueB?: unknown;
  severity: Severity;
  /** Contexto adicional para mostrar o loguear. */
  meta?: Record<string, unknown>;
}

export interface ComparisonResult {
  conflicts: GenericConflict[];
  hasConflicts: boolean;
  worstSeverity: Severity | null;
}

export interface ComparisonRule {
  /** Path del campo a comparar (dot notation, por ejemplo 'price' o 'address.city'). */
  field: string;
  /** Tolerancia permitida para campos numericos (0-1 como fraccion; por ejemplo 0.01 = 1%). */
  tolerance?: number;
  /** Categoria a asignar si este campo difiere. Por defecto: 'soft_drift'. */
  category?: ConflictCategory;
  severity?: Severity;
  /** Si es true, se omite este campo durante la comparacion. */
  ignore?: boolean;
}

export interface Snapshot {
  capturedAt: Date;
  payload: Record<string, unknown>;
}

export interface DuplicateGroup {
  entities: Record<string, unknown>[];
  confidence: number;
  reason: string;
}
