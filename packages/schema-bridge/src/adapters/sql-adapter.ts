import { createHash } from 'crypto';
import type { InferredJsonSchema, SchemaField, JsonPrimitiveType } from '../types.js';

export interface SchemaAdapter {
  adapt(): InferredJsonSchema;
}

const SQL_TYPE_MAP: Record<string, { type: JsonPrimitiveType; format?: string }> = {
  int: { type: 'number' }, integer: { type: 'number' }, int2: { type: 'number' },
  int4: { type: 'number' }, int8: { type: 'number' }, bigint: { type: 'number' },
  bigserial: { type: 'number' }, serial: { type: 'number' }, smallint: { type: 'number' },
  tinyint: { type: 'number' }, mediumint: { type: 'number' },
  decimal: { type: 'number' }, numeric: { type: 'number' }, float: { type: 'number' },
  float4: { type: 'number' }, float8: { type: 'number' }, real: { type: 'number' },
  double: { type: 'number' }, money: { type: 'string', format: 'ar-money-string' },
  char: { type: 'string' }, varchar: { type: 'string' }, nvarchar: { type: 'string' },
  character: { type: 'string' }, text: { type: 'string' }, clob: { type: 'string' },
  date: { type: 'string', format: 'date' },
  datetime: { type: 'string', format: 'date-time' },
  timestamp: { type: 'string', format: 'date-time' },
  timestamptz: { type: 'string', format: 'date-time' },
  time: { type: 'string' },
  bool: { type: 'boolean' }, boolean: { type: 'boolean' }, bit: { type: 'boolean' },
  uuid: { type: 'string', format: 'uuid' },
  json: { type: 'object' }, jsonb: { type: 'object' },
  blob: { type: 'string' }, bytea: { type: 'string' }, binary: { type: 'string' },
};

export class SqlDdlAdapter implements SchemaAdapter {
  constructor(private readonly ddl: string) {}

  adapt(): InferredJsonSchema {
    const fields: SchemaField[] = [];

    // Strip comments
    const clean = this.ddl
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/--[^\n]*/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    const match = clean.match(/CREATE\s+(?:TEMPORARY\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?\S+\s*\((.+)\)\s*;?/i);
    if (!match) {
      throw new Error('Invalid SQL DDL: Could not find column definitions.');
    }

    const columnsContent = match[1];
    const columnDefinitions = this.splitColumns(columnsContent);

    // Detect table-level PRIMARY KEY (col1, col2, ...)
    const tablePkCols = new Set<string>();
    for (const def of columnDefinitions) {
      const pkMatch = def.trim().match(/^PRIMARY\s+KEY\s*\(([^)]+)\)/i);
      if (pkMatch) {
        for (const col of pkMatch[1].split(',')) {
          tablePkCols.add(col.trim().replace(/^[`"[]|[`"\]]$/g, '').toLowerCase());
        }
      }
    }

    for (const def of columnDefinitions) {
      const t = def.trim();
      if (/^(PRIMARY\s+KEY|UNIQUE\s+(?:KEY|INDEX)?|CONSTRAINT|INDEX|KEY\s+\w|FOREIGN\s+KEY|CHECK\s*\()/i.test(t)) continue;

      const parts = t.split(/\s+/).filter(Boolean);
      if (parts.length < 2) continue;

      const rawName = parts[0].replace(/^[`"[]|[`"\]]$/g, '');
      const colNameLower = rawName.toLowerCase();
      const rawType = parts[1].split('(')[0].toLowerCase().replace(/\s+precision$/, '');

      if (['primary', 'foreign', 'constraint', 'unique', 'index', 'key'].includes(colNameLower)) continue;

      const { type, format } = SQL_TYPE_MAP[rawType] ?? { type: 'string' as JsonPrimitiveType };
      const upper = t.toUpperCase();
      const isNotNull = upper.includes('NOT NULL') || upper.includes('PRIMARY KEY') || tablePkCols.has(colNameLower);

      fields.push({
        path: colNameLower,
        required: isNotNull,
        node: { type, format, nullable: !isNotNull, examples: [] },
      });
    }

    const sortedForHash = [...fields].sort((a, b) => a.path.localeCompare(b.path));
    const fp = createHash('md5')
      .update(JSON.stringify(sortedForHash.map(f => ({ path: f.path, type: f.node.type, format: f.node.format, nullable: f.node.nullable }))))
      .digest('hex')
      .slice(0, 32);

    return { fields, fingerprint: fp, sampleCount: 0 };
  }

  private splitColumns(content: string): string[] {
    const result: string[] = [];
    let current = '';
    let inParens = 0;
    for (const char of content) {
      if (char === '(') inParens++;
      else if (char === ')') inParens--;
      if (char === ',' && inParens === 0) { result.push(current); current = ''; }
      else current += char;
    }
    if (current.trim()) result.push(current);
    return result;
  }
}
