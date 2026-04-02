import { createHash } from 'crypto';
import yaml from 'js-yaml';
import type { OpenAPIV3 } from 'openapi-types';
import type { InferredJsonSchema, SchemaField, JsonPrimitiveType } from '../types.js';
import type { SchemaAdapter } from './sql-adapter.js';

export class OpenApiAdapter implements SchemaAdapter {
  private doc: OpenAPIV3.Document;

  constructor(content: string, format: 'json' | 'yaml' = 'json') {
    if (format === 'yaml') {
      this.doc = yaml.load(content) as OpenAPIV3.Document;
    } else {
      this.doc = JSON.parse(content);
    }
  }

  adapt(): InferredJsonSchema {
    if (!this.doc.openapi || !this.doc.openapi.startsWith('3.')) {
      throw new Error('Only OpenAPI 3.x is supported currently.');
    }

    const fields: SchemaField[] = [];
    
    // We prioritize components/schemas for seed learning
    const schemas = this.doc.components?.schemas || {};
    
    for (const [schemaName, schema] of Object.entries(schemas)) {
      this.processSchema(schemaName, schema as OpenAPIV3.SchemaObject, fields);
    }

    // Also process paths for request/response bodies which often contain unique field sets
    this.processPaths(fields);

    // Deduplicate fields by path
    const uniqueFields = this.deduplicateFields(fields);

    const sortedForHash = [...uniqueFields].sort((a, b) => a.path.localeCompare(b.path));
    const fp = createHash('md5')
      .update(JSON.stringify(sortedForHash.map(f => ({ 
        path: f.path, 
        type: f.node.type, 
        format: f.node.format 
      }))))
      .digest('hex')
      .slice(0, 32);

    return { 
      fields: uniqueFields, 
      fingerprint: fp, 
      sampleCount: 1 // Specs count as one high-quality sample
    };
  }

  private processSchema(prefix: string, schema: OpenAPIV3.SchemaObject, fields: SchemaField[]) {
    if (schema.type === 'object' && schema.properties) {
      for (const [propName, propSchema] of Object.entries(schema.properties)) {
        const fullPath = prefix ? `${prefix}.${propName}` : propName;
        const s = propSchema as any;
        const type = this.mapOpenApiType(s.type);
        const required = schema.required?.includes(propName) || false;

        fields.push({
          path: fullPath,
          required,
          node: {
            type,
            format: s.format,
            description: s.description,
            examples: s.example ? [s.example] : [],
            nullable: s.nullable || false,
          }
        });

        if (s.type === 'object') {
          this.processSchema(fullPath, s, fields);
        } else if (s.type === 'array' && s.items) {
          const itemSchema = s.items as OpenAPIV3.SchemaObject;
          if (itemSchema.type === 'object') {
            this.processSchema(`${fullPath}[*]`, itemSchema, fields);
          }
        }
      }
    }
  }

  private processPaths(fields: SchemaField[]) {
    if (!this.doc.paths) return;

    for (const [path, pathItem] of Object.entries(this.doc.paths)) {
      if (!pathItem) continue;
      
      const operations = ['get', 'post', 'put', 'patch', 'delete'];
      
      for (const op of operations) {
        const operation = (pathItem as any)[op] as OpenAPIV3.OperationObject;
        if (!operation) continue;

        // Process request body
        if (operation.requestBody) {
          const reqBody = operation.requestBody as OpenAPIV3.RequestBodyObject;
          const content = reqBody.content?.['application/json'];
          if (content?.schema) {
            this.processSchema(`request.${op}.${path}`, content.schema as OpenAPIV3.SchemaObject, fields);
          }
        }

        // Process successful responses (200, 201)
        const successCodes = ['200', '201'];
        for (const code of successCodes) {
          const response = operation.responses?.[code] as OpenAPIV3.ResponseObject;
          const content = response?.content?.['application/json'];
          if (content?.schema) {
            this.processSchema(`response.${op}.${path}.${code}`, content.schema as OpenAPIV3.SchemaObject, fields);
          }
        }
      }
    }
  }

  private mapOpenApiType(oaType: string | undefined): JsonPrimitiveType {
    switch (oaType) {
      case 'integer':
      case 'number':
        return 'number';
      case 'boolean':
        return 'boolean';
      case 'object':
        return 'object';
      case 'array':
        return 'array';
      case 'string':
      default:
        return 'string';
    }
  }

  private deduplicateFields(fields: SchemaField[]): SchemaField[] {
    const map = new Map<string, SchemaField>();
    for (const f of fields) {
      // If we already have this path, we could merge metadata, but for now we keep the first one
      // or prioritize those with descriptions/examples.
      const existing = map.get(f.path);
      if (!existing || (!existing.node.description && f.node.description)) {
        map.set(f.path, f);
      }
    }
    return Array.from(map.values());
  }
}
