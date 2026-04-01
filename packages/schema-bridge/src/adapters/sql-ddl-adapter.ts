/**
 * SqlDdlAdapter
 *
 * Traduce sentencias CREATE TABLE (SQL DDL) directamente al AST `InferredJsonSchema`
 * del schema-bridge, sin necesitar muestras JSON.
 *
 * Casos de uso:
 *   - Integrar sistemas con esquemas SQL exportados (DBAs, Liquibase, Flyway)
 *   - Comparar schemas de BD sin datos de muestra disponibles
 *   - Bootstrapping de la primera ejecución cuando no hay datos reales
 *
 * Soporte DDL:
 *   - Tipos SQL → JsonPrimitiveType + format semántico
 *   - NOT NULL → required: true, nullable: false
 *   - PRIMARY KEY (inline o constraint) → required: true, nullable: false
 *   - Múltiples tablas en un mismo DDL → toma la primera
 *   - Comentarios de linea (--) y bloque eliminados antes del parsing
 *   - Nombres quoted con backtick, doble comilla o corchetes
 *
 * No soportado (fuera de scope):
 *   - FOREIGN KEY, CHECK, DEFAULT (se ignoran silenciosamente)
 *   - ALTER TABLE, CREATE INDEX (se ignoran)
 *   - Arrays y tipos compuestos (mapeado como string genérico)
 */

import { createHash } from 'crypto';
import type { InferredJsonSchema, JsonPrimitiveType, SchemaField, SchemaNode } from '../types.js';

// ─── Tipos SQL → JsonPrimitiveType ────────────────────────────────────────────

const SQL_TYPE_MAP: Record<string, { type: JsonPrimitiveType; format?: string }> = {
  // Enteros
  int: { type: 'number' },
  integer: { type: 'number' },
  int2: { type: 'number' },
  int4: { type: 'number' },
  int8: { type: 'number' },
  bigint: { type: 'number' },
  bigserial: { type: 'number' },
  serial: { type: 'number' },
  serial2: { type: 'number' },
  serial4: { type: 'number' },
  serial8: { type: 'number' },
  smallint: { type: 'number' },
  tinyint: { type: 'number' },
  mediumint: { type: 'number' },
  // Decimales
  decimal: { type: 'number' },
  numeric: { type: 'number' },
  float: { type: 'number' },
  float4: { type: 'number' },
  float8: { type: 'number' },
  real: { type: 'number' },
  double: { type: 'number' },
  money: { type: 'string', format: 'ar-money-string' },
  // Strings
  char: { type: 'string' },
  varchar: { type: 'string' },
  nvarchar: { type: 'string' },
  character: { type: 'string' },
  text: { type: 'string' },
  tinytext: { type: 'string' },
  mediumtext: { type: 'string' },
  longtext: { type: 'string' },
  clob: { type: 'string' },
  // Fechas
  date: { type: 'string', format: 'date' },
  time: { type: 'string' },
  datetime: { type: 'string', format: 'date-time' },
  timestamp: { type: 'string', format: 'date-time' },
  timestamptz: { type: 'string', format: 'date-time' },
  // Booleanos
  bool: { type: 'boolean' },
  boolean: { type: 'boolean' },
  bit: { type: 'boolean' },
  // UUID
  uuid: { type: 'string', format: 'uuid' },
  // JSON
  json: { type: 'object' },
  jsonb: { type: 'object' },
  // Binarios → string opaco
  blob: { type: 'string' },
  bytea: { type: 'string' },
  binary: { type: 'string' },
  varbinary: { type: 'string' },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function stripComments(sql: string): string {
  // Eliminar comentarios de bloque /* ... */
  let result = sql.replace(/\/\*[\s\S]*?\*\//g, ' ');
  // Eliminar comentarios de línea -- ...
  result = result.replace(/--[^\n]*/g, '');
  return result;
}

function unquote(name: string): string {
  return name
    .replace(/^`(.+)`$/, '$1')
    .replace(/^"(.+)"$/, '$1')
    .replace(/^\[(.+)\]$/, '$1')
    .toLowerCase();
}

function resolveSqlType(rawType: string): { type: JsonPrimitiveType; format?: string } {
  // Toma solo la palabra base ignorando parámetros: VARCHAR(255) → varchar
  const base = rawType.split('(')[0].trim().toLowerCase();
  // "double precision" → "double"
  const normalized = base.replace(/\s+precision$/, '');
  return SQL_TYPE_MAP[normalized] ?? { type: 'string' };
}

function canonicalize(schema: InferredJsonSchema): string {
  const sorted = [...schema.fields].sort((a, b) => a.path.localeCompare(b.path));
  return JSON.stringify(sorted.map(f => ({
    path: f.path,
    type: f.node.type,
    format: f.node.format,
    nullable: f.node.nullable,
    required: f.required,
  })));
}

function fingerprint(schema: InferredJsonSchema): string {
  return createHash('md5').update(canonicalize(schema)).digest('hex').slice(0, 32);
}

// ─── Parser ──────────────────────────────────────────────────────────────────

interface ColumnDef {
  name: string;
  type: JsonPrimitiveType;
  format?: string;
  notNull: boolean;
  primaryKey: boolean;
}

function parseCreateTable(sql: string): { tableName: string; columns: ColumnDef[] } | null {
  const clean = stripComments(sql).replace(/\s+/g, ' ').trim();

  // Buscar CREATE TABLE ... ( ... )
  const tableMatch = clean.match(
    /CREATE\s+(?:TEMPORARY\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(\S+)\s*\((.+)\)\s*;?/i,
  );
  if (!tableMatch) return null;

  const tableName = unquote(tableMatch[1]);
  const body = tableMatch[2];

  // Detectar columnas PK declaradas en tabla-level: PRIMARY KEY (col1, col2, ...)
  const tablePkMatch = body.match(/PRIMARY\s+KEY\s*\(([^)]+)\)/i);
  const tablePkCols = new Set<string>();
  if (tablePkMatch) {
    for (const col of tablePkMatch[1].split(',')) {
      tablePkCols.add(unquote(col.trim()));
    }
  }

  const columns: ColumnDef[] = [];

  // Dividir en tokens de columna/constraint por coma, respetando paréntesis anidados
  const tokens: string[] = [];
  let depth = 0;
  let current = '';
  for (const ch of body) {
    if (ch === '(') { depth++; current += ch; }
    else if (ch === ')') { depth--; current += ch; }
    else if (ch === ',' && depth === 0) {
      tokens.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) tokens.push(current.trim());

  for (const token of tokens) {
    const t = token.trim();

    // Saltar constraints de tabla: PRIMARY KEY (...), UNIQUE (...), CONSTRAINT, INDEX, KEY, FOREIGN KEY
    if (/^(PRIMARY\s+KEY|UNIQUE\s+KEY|UNIQUE\s+INDEX|UNIQUE\b|CONSTRAINT|INDEX|KEY|FOREIGN\s+KEY|CHECK\s*\()/i.test(t)) {
      continue;
    }

    // Columna: `name` TYPE [opciones]
    // Acepta nombres quoted o sin quotes
    const colMatch = t.match(/^([`"\[]?\w+[`"\]]?)\s+(\S+(?:\s*\([^)]*\))?(?:\s+(?:varying|precision|without\s+time\s+zone|with\s+time\s+zone))?)/i);
    if (!colMatch) continue;

    const colName = unquote(colMatch[1]);
    const rawType = colMatch[2];
    const { type, format } = resolveSqlType(rawType);

    const rest = t.slice(colMatch[0].length).toUpperCase();
    const notNull = /NOT\s+NULL/.test(rest) || /PRIMARY\s+KEY/.test(rest);
    const primaryKey = /PRIMARY\s+KEY/.test(rest) || tablePkCols.has(colName);

    columns.push({ name: colName, type, format, notNull, primaryKey });
  }

  return { tableName, columns };
}

// ─── SchemaAdapter interface ──────────────────────────────────────────────────

export interface SchemaAdapter {
  id: string;
  /**
   * Convierte una representación externa de schema a `InferredJsonSchema`.
   * @throws {Error} si el input no es parseable.
   */
  adapt(input: string): InferredJsonSchema;
}

// ─── SqlDdlAdapter ────────────────────────────────────────────────────────────

/**
 * Convierte un CREATE TABLE SQL a `InferredJsonSchema`.
 *
 * Cuando hay múltiples statements en el input, se usa el primero válido.
 * `sampleCount` se fija en 0 (sin muestras reales).
 *
 * @throws {Error} si no se encuentra ningún CREATE TABLE válido.
 */
export class SqlDdlAdapter implements SchemaAdapter {
  readonly id = 'sql-ddl';

  adapt(sql: string): InferredJsonSchema {
    const parsed = parseCreateTable(sql);
    if (!parsed) {
      throw new Error('[SqlDdlAdapter] No se encontró un CREATE TABLE válido en el input.');
    }

    const { columns } = parsed;

    const fields: SchemaField[] = columns.map(col => {
      const node: SchemaNode = {
        type: col.type,
        format: col.format,
        nullable: !col.notNull && !col.primaryKey,
        examples: [],
      };

      return {
        path: col.name,
        required: col.notNull || col.primaryKey,
        node,
      };
    });

    const partial: Omit<InferredJsonSchema, 'fingerprint'> = {
      fields,
      sampleCount: 0,
    };

    const schema = partial as InferredJsonSchema;
    (schema as { fingerprint: string }).fingerprint = fingerprint(schema);

    return schema;
  }
}

export function createSqlDdlAdapter(): SqlDdlAdapter {
  return new SqlDdlAdapter();
}
