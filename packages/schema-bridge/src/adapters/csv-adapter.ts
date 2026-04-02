import { createHash } from 'crypto';
import Papa from 'papaparse';
import type { InferredJsonSchema, SchemaField, JsonPrimitiveType } from '../types.js';
import type { SchemaAdapter } from './sql-adapter.js';

export class CsvAdapter implements SchemaAdapter {
  constructor(private readonly csvContent: string, private readonly delimiter?: string) {}

  adapt(): InferredJsonSchema {
    const parseResult = Papa.parse(this.csvContent, {
      header: true,
      skipEmptyLines: true,
      delimiter: this.delimiter,
    });

    if (parseResult.errors.length > 0 && parseResult.data.length === 0) {
      throw new Error(`CSV Parsing Error: ${parseResult.errors[0].message}`);
    }

    const data = parseResult.data as Record<string, string>[];
    const headers = parseResult.meta.fields || [];
    const fields: SchemaField[] = [];

    for (const header of headers) {
      const samples = data.map(row => row[header]).filter(v => v !== undefined && v !== '');
      const inferredType = this.inferType(samples);

      fields.push({
        path: header,
        required: samples.length === data.length,
        node: {
          type: inferredType.type,
          format: inferredType.format,
          nullable: samples.length < data.length,
          examples: samples.slice(0, 5),
        },
      });
    }

    const sortedForHash = [...fields].sort((a, b) => a.path.localeCompare(b.path));
    const fp = createHash('md5')
      .update(JSON.stringify(sortedForHash.map(f => ({ 
        path: f.path, 
        type: f.node.type, 
        format: f.node.format, 
        nullable: f.node.nullable 
      }))))
      .digest('hex')
      .slice(0, 32);

    return { fields, fingerprint: fp, sampleCount: data.length };
  }

  private inferType(samples: string[]): { type: JsonPrimitiveType; format?: string } {
    if (samples.length === 0) return { type: 'string' };

    let isNumber = true;
    let isBoolean = true;
    let isDate = true;

    for (const sample of samples) {
      const s = sample.trim();
      if (isNumber && isNaN(Number(s))) isNumber = false;
      if (isBoolean && !['true', 'false', '1', '0', 'yes', 'no'].includes(s.toLowerCase())) isBoolean = false;
      if (isDate && isNaN(Date.parse(s))) isDate = false;
    }

    if (isBoolean) return { type: 'boolean' };
    if (isNumber) return { type: 'number' };
    if (isDate) return { type: 'string', format: 'date-time' };

    return { type: 'string' };
  }
}
