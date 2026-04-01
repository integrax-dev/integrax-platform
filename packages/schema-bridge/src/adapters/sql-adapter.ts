import type { InferredJsonSchema, SchemaField, JsonPrimitiveType } from '../types.js';

export interface SchemaAdapter {
  adapt(): InferredJsonSchema;
}

export class SqlDdlAdapter implements SchemaAdapter {
  constructor(private readonly ddl: string) {}

  adapt(): InferredJsonSchema {
    const fields: SchemaField[] = [];
    
    // Normalize string (remove newlines, extra spaces)
    const normalized = this.ddl.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
    
    // Extract everything between the first '(' and the last ')'
    const match = normalized.match(/\((.*)\)/);
    if (!match) {
      throw new Error('Invalid SQL DDL: Could not find column definitions.');
    }

    // Split columns by comma. This is a naive split that doesn't handle commas inside parens like DECIMAL(10,2).
    // We will do a slightly smarter split.
    const columnsContent = match[1];
    const columnDefinitions = this.splitColumns(columnsContent);

    for (const def of columnDefinitions) {
      const parts = def.trim().split(' ').filter(Boolean);
      if (parts.length < 2) continue;

      const rawName = parts[0].replace(/['"`]/g, '');
      const rawType = parts[1].toUpperCase();

      // Skip constraints like PRIMARY KEY, FOREIGN KEY, etc at the table level
      if (rawName.toUpperCase() === 'PRIMARY' || rawName.toUpperCase() === 'FOREIGN' || rawName.toUpperCase() === 'CONSTRAINT') {
        continue;
      }

      const isNotNull = def.toUpperCase().includes('NOT NULL') || def.toUpperCase().includes('PRIMARY KEY');

      fields.push({
        path: rawName,
        required: isNotNull,
        node: {
          type: this.mapSqlType(rawType),
          nullable: !isNotNull,
          examples: [],
        }
      });
    }

    return {
      fields,
      fingerprint: `sql_adapter_${fields.length}_${fields.map(f => f.path).join(',')}`.slice(0, 64),
      sampleCount: 0,
    };
  }

  private splitColumns(content: string): string[] {
    const result: string[] = [];
    let current = '';
    let inParens = 0;

    for (let i = 0; i < content.length; i++) {
      const char = content[i];
      if (char === '(') inParens++;
      if (char === ')') inParens--;

      if (char === ',' && inParens === 0) {
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    if (current.trim()) result.push(current);
    
    return result;
  }

  private mapSqlType(sqlType: string): JsonPrimitiveType {
    if (sqlType.startsWith('INT') || sqlType.startsWith('DECIMAL') || sqlType.startsWith('NUMERIC') || sqlType.startsWith('FLOAT') || sqlType.startsWith('REAL')) {
      return 'number';
    }
    if (sqlType.startsWith('BOOL')) {
      return 'boolean';
    }
    if (sqlType.startsWith('DATE') || sqlType.startsWith('TIME') || sqlType.startsWith('TIMESTAMP')) {
      return 'string'; // ISO strings in JSON land
    }
    // Default to string for VARCHAR, TEXT, CHAR, UUID, etc.
    return 'string';
  }
}
