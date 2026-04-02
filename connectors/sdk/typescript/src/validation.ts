/**
 * Utilities for early schema validation
 *
 * SchemaMismatchError: caught by kafka-consumer / worker to trigger
 * the `generateSchemaDiff` Temporal Activity as an automatic fallback.
 *
 * validatePayloadStructurally: lightweight runtime validation.
 * For deep schema diff analysis use @integrax/schema-bridge directly.
 */

// ─── Error tipado ─────────────────────────────────────────────────────────────

export class SchemaMismatchError extends Error {
  public readonly sourcePayload: unknown;
  public readonly expectedSchemaId: string;
  /** Fields missing from the received payload */
  public readonly missingFields: string[];
  /** Fields with an unexpected type { field, expected, received } */
  public readonly typeViolations: Array<{ field: string; expected: string; received: string }>;

  constructor(
    message: string,
    expectedSchemaId: string,
    sourcePayload: unknown,
    opts: { missingFields?: string[]; typeViolations?: Array<{ field: string; expected: string; received: string }> } = {},
  ) {
    super(message);
    this.name = 'SchemaMismatchError';
    this.expectedSchemaId = expectedSchemaId;
    this.sourcePayload = sourcePayload;
    this.missingFields = opts.missingFields ?? [];
    this.typeViolations = opts.typeViolations ?? [];
  }

  /** Serializes the error for structured logging */
  toLogContext(): Record<string, unknown> {
    return {
      schemaId: this.expectedSchemaId,
      missingFields: this.missingFields,
      typeViolations: this.typeViolations,
      message: this.message,
    };
  }
}

// ─── Expected types (practical subset) ───────────────────────────────────────

export type ExpectedType = 'string' | 'number' | 'boolean' | 'object' | 'array' | 'any';

export interface FieldSpec {
  name: string;
  required?: boolean;
  type?: ExpectedType;
}

// ─── Lightweight structural validation ───────────────────────────────────────

/**
 * Valida un payload en runtime contra una lista de campos esperados.
 * Lanza SchemaMismatchError si hay campos faltantes o tipos incorrectos.
 *
 * El kafka-consumer y el worker capturan este error para disparar
 * la Temporal Activity `generateSchemaDiff` como fallback automático.
 *
 * @example
 * validatePayloadStructurally(
 *   payload,
 *   [{ name: 'id', required: true, type: 'string' }, { name: 'monto', type: 'number' }],
 *   'mercadopago-payment-v2'
 * );
 */
export function validatePayloadStructurally(
  payload: unknown,
  expectedFields: FieldSpec[] | string[],
  schemaId: string,
): void {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new SchemaMismatchError('Payload no es un objeto', schemaId, payload);
  }

  const obj = payload as Record<string, unknown>;

  // Normalize: accepts string[] for backward compatibility
  const specs: FieldSpec[] = expectedFields.map(f =>
    typeof f === 'string' ? { name: f, required: true } : f,
  );

  const missingFields: string[] = [];
  const typeViolations: Array<{ field: string; expected: string; received: string }> = [];

  for (const spec of specs) {
    const value = obj[spec.name];
    const isAbsent = value === undefined;

    if (isAbsent) {
      if (spec.required !== false) missingFields.push(spec.name);
      continue;
    }

    if (spec.type && spec.type !== 'any') {
      const received = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
      const expected = spec.type;
      if (received !== expected) {
        typeViolations.push({ field: spec.name, expected, received });
      }
    }
  }

  if (missingFields.length > 0 || typeViolations.length > 0) {
    const parts: string[] = [];
    if (missingFields.length > 0) parts.push(`Campos faltantes: ${missingFields.join(', ')}`);
    if (typeViolations.length > 0) {
      parts.push(`Tipos incorrectos: ${typeViolations.map(v => `${v.field} (esperado ${v.expected}, recibido ${v.received})`).join('; ')}`);
    }
    throw new SchemaMismatchError(parts.join('. '), schemaId, payload, {
      missingFields,
      typeViolations,
    });
  }
}

/**
 * Versión que retorna un resultado en lugar de lanzar excepción.
 * Útil para validación silenciosa antes de decidir si triggerear el diff engine.
 */
export function checkPayloadStructure(
  payload: unknown,
  expectedFields: FieldSpec[] | string[],
  schemaId: string,
): { valid: boolean; error?: SchemaMismatchError } {
  try {
    validatePayloadStructurally(payload, expectedFields, schemaId);
    return { valid: true };
  } catch (err) {
    if (err instanceof SchemaMismatchError) return { valid: false, error: err };
    throw err;
  }
}
