import { createHash } from 'crypto';
// @ts-ignore
import parquet from 'parquetjs-lite';
import type { InferredJsonSchema, SchemaField, JsonPrimitiveType } from '../types.js';
import type { SchemaAdapter } from './sql-adapter.js';

export class ParquetAdapter implements SchemaAdapter {
  private schema: { fields: Record<string, { primitiveType: string; originalType?: string | null; optional?: boolean }> } | undefined;

  constructor(private readonly filePath: string) {}

  async init(): Promise<void> {
    const reader = await parquet.ParquetReader.openFile(this.filePath);
    this.schema = reader.getSchema();
    await reader.close();
  }

  adapt(): InferredJsonSchema {
    if (!this.schema) {
      throw new Error('ParquetAdapter not initialized. Call init() first.');
    }

    const fields: SchemaField[] = [];
    for (const fieldName in this.schema.fields) {
      const field = this.schema.fields[fieldName];
      const { type, format } = this.mapParquetType(field.primitiveType, field.originalType);

      fields.push({
        path: fieldName,
        required: !field.optional,
        node: {
          type,
          format,
          nullable: field.optional,
          examples: [],
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

    return { fields, fingerprint: fp, sampleCount: 0 };
  }

  private mapParquetType(primitiveType: string, originalType?: string | null): { type: JsonPrimitiveType; format?: string } {
    if (originalType === 'UTF8') return { type: 'string' };
    if (originalType === 'DATE') return { type: 'string', format: 'date' };
    if (originalType === 'TIMESTAMP_MILLIS' || originalType === 'TIMESTAMP_MICROS') return { type: 'string', format: 'date-time' };
    if (originalType === 'JSON') return { type: 'object' };
    if (originalType === 'BSON') return { type: 'object' };
    if (originalType === 'UUID') return { type: 'string', format: 'uuid' };

    switch (primitiveType) {
      case 'BOOLEAN': return { type: 'boolean' };
      case 'INT32':
      case 'INT64':
      case 'INT96':
      case 'FLOAT':
      case 'DOUBLE': return { type: 'number' };
      case 'BYTE_ARRAY': return { type: 'string' };
      default: return { type: 'string' };
    }
  }
}
