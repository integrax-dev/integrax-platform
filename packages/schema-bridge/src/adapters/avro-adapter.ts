import { createHash } from 'crypto';
import type { InferredJsonSchema, SchemaField, JsonPrimitiveType } from '../types.js';
import type { SchemaAdapter } from './sql-adapter.js';

// ─── Avro → JSON type mapping ─────────────────────────────────────────────────

interface AvroTypeMapping {
  type: JsonPrimitiveType;
  format?: string;
}

/**
 * Maps Avro logical types (annotated with logicalType) to JSON formats.
 */
const AVRO_LOGICAL_TYPE_MAP: Record<string, AvroTypeMapping> = {
  'date': { type: 'string', format: 'date' },
  'time-millis': { type: 'string', format: 'time' },
  'time-micros': { type: 'string', format: 'time' },
  'timestamp-millis': { type: 'string', format: 'date-time' },
  'timestamp-micros': { type: 'string', format: 'date-time' },
  'local-timestamp-millis': { type: 'string', format: 'date-time' },
  'local-timestamp-micros': { type: 'string', format: 'date-time' },
  'uuid': { type: 'string', format: 'uuid' },
  'decimal': { type: 'number' },
  'duration': { type: 'string' },
};

/**
 * Maps Avro primitive types to JSON types.
 */
const AVRO_PRIMITIVE_MAP: Record<string, AvroTypeMapping> = {
  null: { type: 'null' },
  boolean: { type: 'boolean' },
  int: { type: 'number' },
  long: { type: 'number' },
  float: { type: 'number' },
  double: { type: 'number' },
  bytes: { type: 'string' },
  string: { type: 'string' },
  enum: { type: 'string' },
  fixed: { type: 'string' },
  map: { type: 'object' },
  record: { type: 'object' },
  array: { type: 'array' },
};

// ─── Avro type resolution ─────────────────────────────────────────────────────

interface ResolvedAvroType {
  type: JsonPrimitiveType;
  format?: string;
  nullable: boolean;
}

/**
 * Resolves an Avro type descriptor (string, object, or union array) to
 * a JSON primitive type, optional format, and nullability.
 */
function resolveAvroType(avroType: unknown): ResolvedAvroType {
  // Union: ["null", "string"] or ["null", {type: "record", ...}]
  if (Array.isArray(avroType)) {
    const nonNull = avroType.filter(t => t !== 'null');
    const nullable = nonNull.length < avroType.length; // had a "null" in the union
    if (nonNull.length === 0) return { type: 'null', nullable: true };
    const resolved = resolveAvroType(nonNull[0]);
    return { ...resolved, nullable };
  }

  // Simple primitive string: "string", "int", etc.
  if (typeof avroType === 'string') {
    return { ...(AVRO_PRIMITIVE_MAP[avroType] ?? { type: 'string' }), nullable: false };
  }

  // Complex type object: { type: "...", logicalType: "...", ... }
  if (typeof avroType === 'object' && avroType !== null) {
    const t = avroType as Record<string, unknown>;
    const logicalType = typeof t['logicalType'] === 'string' ? t['logicalType'] : null;
    if (logicalType && AVRO_LOGICAL_TYPE_MAP[logicalType]) {
      return { ...AVRO_LOGICAL_TYPE_MAP[logicalType], nullable: false };
    }
    const baseType = typeof t['type'] === 'string' ? t['type'] : 'string';
    return { ...(AVRO_PRIMITIVE_MAP[baseType] ?? { type: 'string' }), nullable: false };
  }

  return { type: 'string', nullable: false };
}

// ─── AvroSchemaAdapter ────────────────────────────────────────────────────────

/**
 * Adapts an Avro schema (as a parsed JSON object or JSON string) to
 * InferredJsonSchema. Only handles top-level record schemas.
 *
 * Usage:
 *   const schema = new AvroSchemaAdapter(avroSchemaJson).adapt();
 */
export class AvroSchemaAdapter implements SchemaAdapter {
  private readonly schema: unknown;

  constructor(schema: string | Record<string, unknown>) {
    this.schema = typeof schema === 'string' ? JSON.parse(schema) : schema;
  }

  adapt(): InferredJsonSchema {
    const root = this.schema as Record<string, unknown>;

    if (root['type'] !== 'record' || !Array.isArray(root['fields'])) {
      throw new Error('Invalid Avro schema: expected a top-level record type with fields array.');
    }

    const fields: SchemaField[] = [];
    this.collectFields(root['fields'] as AvroField[], '', fields);

    const sortedForHash = [...fields].sort((a, b) => a.path.localeCompare(b.path));
    const fp = createHash('md5')
      .update(JSON.stringify(sortedForHash.map(f => ({ path: f.path, type: f.node.type, format: f.node.format, nullable: f.node.nullable }))))
      .digest('hex')
      .slice(0, 32);

    return { fields, fingerprint: fp, sampleCount: 0 };
  }

  private collectFields(
    avroFields: AvroField[],
    prefix: string,
    out: SchemaField[],
  ): void {
    for (const field of avroFields) {
      const path = prefix ? `${prefix}.${field.name}` : field.name;
      const resolved = resolveAvroType(field.type);

      // If it's a nested record, recurse
      const innerType = unwrapNullableType(field.type);
      if (isAvroRecord(innerType)) {
        this.collectFields((innerType as Record<string, unknown>)['fields'] as AvroField[], path, out);
        continue;
      }

      // Avro fields without a default and not a union-with-null are required
      const hasDefault = Object.prototype.hasOwnProperty.call(field, 'default');
      const required = !resolved.nullable && !hasDefault;

      out.push({
        path,
        required,
        node: {
          type: resolved.type,
          ...(resolved.format ? { format: resolved.format } : {}),
          nullable: resolved.nullable,
          examples: [],
        },
      });
    }
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

interface AvroField {
  name: string;
  type: unknown;
  default?: unknown;
}

function unwrapNullableType(avroType: unknown): unknown {
  if (Array.isArray(avroType)) {
    const nonNull = (avroType as unknown[]).filter(t => t !== 'null');
    return nonNull.length === 1 ? nonNull[0] : avroType;
  }
  return avroType;
}

function isAvroRecord(avroType: unknown): boolean {
  return (
    typeof avroType === 'object' &&
    avroType !== null &&
    (avroType as Record<string, unknown>)['type'] === 'record' &&
    Array.isArray((avroType as Record<string, unknown>)['fields'])
  );
}

export function createAvroSchemaAdapter(schema: string | Record<string, unknown>): AvroSchemaAdapter {
  return new AvroSchemaAdapter(schema);
}
