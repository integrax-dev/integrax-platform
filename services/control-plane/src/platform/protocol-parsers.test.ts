import { describe, it, expect } from 'vitest';
import {
  parseCsv,
  parseJsonl,
  parseAvro,
  parseXml,
  parseGraphql,
  parseParquet,
  parseProtobuf,
} from './protocol-parsers.js';

// Helper — extract just the names from a ParsedField array
const names = (fields: ReturnType<typeof parseCsv>) => fields.map(f => f.name);

// ─── CSV ──────────────────────────────────────────────────────────────────────

describe('parseCsv', () => {
  it('parses a plain header row', () => {
    expect(names(parseCsv('id,name,email'))).toEqual(['id', 'name', 'email']);
  });

  it('strips surrounding quotes from column names', () => {
    expect(names(parseCsv('"order_id","full name","created_at"'))).toEqual([
      'order_id', 'full name', 'created_at',
    ]);
  });

  it('ignores sample data rows', () => {
    const csv = 'id,name,amount\n1,Alice,100\n2,Bob,200';
    expect(names(parseCsv(csv))).toEqual(['id', 'name', 'amount']);
  });

  it('handles a header with quoted commas', () => {
    expect(names(parseCsv('"last, first",age'))).toEqual(['last, first', 'age']);
  });

  it('returns empty array for empty input', () => {
    expect(parseCsv('')).toEqual([]);
  });

  // Metabase CSV export has these columns
  it('parses Metabase-style export header', () => {
    const header = 'Artículos netos,Ventas brutas,Descuentos,Devoluciones,Ventas netas,Impuestos';
    expect(names(parseCsv(header))).toEqual([
      'Artículos netos', 'Ventas brutas', 'Descuentos',
      'Devoluciones', 'Ventas netas', 'Impuestos',
    ]);
  });

  it('handles Windows CRLF line endings (Metabase on Windows)', () => {
    const csv = 'id,name,amount\r\n1,Alice,100\r\n2,Bob,200';
    expect(names(parseCsv(csv))).toEqual(['id', 'name', 'amount']);
  });

  it('returns every field with correct ParsedField shape', () => {
    const fields = parseCsv('id,name');
    for (const f of fields) {
      expect(f.types).toEqual(['string']);
      expect(f.nullable).toBe(false);
      expect(f.frequency).toBe(1);
    }
  });
});

// ─── JSONL ────────────────────────────────────────────────────────────────────

describe('parseJsonl', () => {
  it('infers schema from the first JSON object', () => {
    const jsonl = '{"id":1,"name":"Alice","amount":100}\n{"id":2,"name":"Bob","amount":200}';
    expect(names(parseJsonl(jsonl))).toEqual(['id', 'name', 'amount']);
  });

  it('skips blank lines before the first record', () => {
    const jsonl = '\n\n{"product":"x","price":9.99}';
    expect(names(parseJsonl(jsonl))).toEqual(['product', 'price']);
  });

  it('returns empty array for non-JSON content', () => {
    expect(parseJsonl('not json at all')).toEqual([]);
  });

  it('returns empty array for empty input', () => {
    expect(parseJsonl('')).toEqual([]);
  });

  it('returns empty for a JSON array (wrong format — use parseAvro or parseCsv instead)', () => {
    // A JSON array is not JSONL — each line must be a standalone object
    expect(parseJsonl('[{"id":1},{"id":2}]')).toEqual([]);
  });
});

// ─── Avro ─────────────────────────────────────────────────────────────────────

describe('parseAvro', () => {
  it('parses a standard Avro record schema', () => {
    const schema = JSON.stringify({
      type: 'record',
      name: 'User',
      fields: [
        { name: 'id', type: 'int' },
        { name: 'email', type: 'string' },
      ],
    });
    expect(names(parseAvro(schema))).toEqual(['id', 'email']);
  });

  it('marks nullable union fields correctly', () => {
    const schema = JSON.stringify({
      fields: [
        { name: 'phone', type: ['null', 'string'] },
        { name: 'name',  type: 'string' },
      ],
    });
    const fields = parseAvro(schema);
    expect(fields.find(f => f.name === 'phone')?.nullable).toBe(true);
    expect(fields.find(f => f.name === 'name')?.nullable).toBe(false);
  });

  it('handles flat { fields: [...] } without type wrapper', () => {
    const schema = JSON.stringify({ fields: [{ name: 'sku' }, { name: 'qty' }] });
    expect(names(parseAvro(schema))).toEqual(['sku', 'qty']);
  });

  it('returns empty array for invalid JSON', () => {
    expect(parseAvro('not avro')).toEqual([]);
  });
});

// ─── XML / SOAP ───────────────────────────────────────────────────────────────

describe('parseXml', () => {
  it('extracts element names from a simple XML doc', () => {
    const xml = '<root><id>1</id><name>Alice</name></root>';
    expect(names(parseXml(xml))).toEqual(expect.arrayContaining(['root', 'id', 'name']));
  });

  it('strips namespace prefixes', () => {
    const xml = '<xs:schema><xs:element name="order"/></xs:schema>';
    const result = names(parseXml(xml));
    expect(result).toContain('schema');
    expect(result).toContain('element');
    expect(result).not.toContain('xs:schema');
  });

  it('extracts attribute names', () => {
    const xml = '<user id="1" role="admin"/>';
    const result = names(parseXml(xml));
    expect(result).toContain('id');
    expect(result).toContain('role');
  });

  it('excludes xmlns pseudo-attribute', () => {
    const xml = '<root xmlns="http://example.com"><field/></root>';
    expect(names(parseXml(xml))).not.toContain('xmlns');
  });

  it('deduplicates repeated element names', () => {
    const xml = '<items><item>a</item><item>b</item></items>';
    const result = names(parseXml(xml));
    expect(result.filter(n => n === 'item')).toHaveLength(1);
  });

  it('returns empty array for empty input', () => {
    expect(parseXml('')).toEqual([]);
  });

  it('handles self-closing tags', () => {
    const xml = '<schema><field name="id" type="int"/><field name="ts" type="timestamp"/></schema>';
    expect(names(parseXml(xml))).toEqual(expect.arrayContaining(['field', 'schema', 'name', 'type']));
  });
});

// ─── GraphQL SDL ──────────────────────────────────────────────────────────────

describe('parseGraphql', () => {
  it('extracts fields from a type definition', () => {
    const sdl = `
type User {
  id: ID!
  name: String
  email: String
}`;
    expect(names(parseGraphql(sdl))).toEqual(expect.arrayContaining(['id', 'name', 'email']));
  });

  it('handles fields with arguments (resolver args)', () => {
    const sdl = `
type Query {
  user(id: ID!): User
  products(limit: Int): [Product]
}`;
    expect(names(parseGraphql(sdl))).toEqual(expect.arrayContaining(['user', 'products']));
  });

  it('works with input types', () => {
    const sdl = `
input CreateOrderInput {
  customerId: String!
  items: [ItemInput!]!
  total: Float
}`;
    expect(names(parseGraphql(sdl))).toEqual(
      expect.arrayContaining(['customerId', 'items', 'total']),
    );
  });

  it('deduplicates fields that appear in multiple types', () => {
    const sdl = `
type A {
  id: ID
}
type B {
  id: ID
}`;
    expect(names(parseGraphql(sdl)).filter(n => n === 'id')).toHaveLength(1);
  });

  it('extracts fields from interface types', () => {
    const sdl = `
interface Node {
  id: ID!
  createdAt: String
}`;
    expect(names(parseGraphql(sdl))).toEqual(expect.arrayContaining(['id', 'createdAt']));
  });

  it('does not include enum values as fields', () => {
    // Enum values are at 2+ spaces indent and could match fieldName: Type
    // but they have no `:` so they won't be caught by the regex
    const sdl = `
enum Status {
  OPEN
  CLOSED
  PENDING
}
type Order {
  status: Status
}`;
    const result = names(parseGraphql(sdl));
    expect(result).not.toContain('OPEN');
    expect(result).not.toContain('CLOSED');
    expect(result).toContain('status');
  });

  it('returns empty array for empty input', () => {
    expect(parseGraphql('')).toEqual([]);
  });
});

// ─── Parquet ──────────────────────────────────────────────────────────────────

describe('parseParquet', () => {
  it('parses { columns: [...] } JSON shape', () => {
    const schema = JSON.stringify({
      columns: [{ name: 'order_id' }, { name: 'amount' }, { name: 'ts' }],
    });
    expect(names(parseParquet(schema))).toEqual(['order_id', 'amount', 'ts']);
  });

  it('parses { fields: [...] } Arrow/Spark style', () => {
    const schema = JSON.stringify({
      fields: [{ name: 'sku', type: 'utf8' }, { name: 'qty', type: 'int32' }],
    });
    expect(names(parseParquet(schema))).toEqual(['sku', 'qty']);
  });

  it('parses PyArrow { schema: { fields: [...] } } shape', () => {
    const schema = JSON.stringify({
      schema: { fields: [{ name: 'product_id' }, { name: 'price' }] },
    });
    expect(names(parseParquet(schema))).toEqual(['product_id', 'price']);
  });

  it('marks nullable columns', () => {
    const schema = JSON.stringify({
      columns: [{ name: 'id', nullable: false }, { name: 'note', nullable: true }],
    });
    const fields = parseParquet(schema);
    expect(fields.find(f => f.name === 'note')?.nullable).toBe(true);
    expect(fields.find(f => f.name === 'id')?.nullable).toBe(false);
  });

  it('parses Parquet DDL text (message syntax)', () => {
    const ddl = `
message sales_schema {
  required binary order_id (UTF8);
  optional int64 amount;
  required int32 year;
}`;
    expect(names(parseParquet(ddl))).toEqual(
      expect.arrayContaining(['order_id', 'amount', 'year']),
    );
  });

  it('returns empty array for empty input', () => {
    expect(parseParquet('')).toEqual([]);
  });

  it('supports field_name key (alternative to name)', () => {
    const schema = JSON.stringify({
      columns: [{ field_name: 'created_at', type: 'timestamp' }, { field_name: 'amount', type: 'decimal' }],
    });
    expect(names(parseParquet(schema))).toEqual(['created_at', 'amount']);
  });

  // Metabase Parquet export would have these column names
  it('parses Metabase-style Parquet schema JSON', () => {
    const schema = JSON.stringify({
      columns: [
        { name: 'gross_sales', type: 'double' },
        { name: 'discounts', type: 'double' },
        { name: 'net_sales', type: 'double' },
        { name: 'taxes', type: 'double' },
      ],
    });
    expect(names(parseParquet(schema))).toEqual(['gross_sales', 'discounts', 'net_sales', 'taxes']);
  });
});

// ─── Protobuf ─────────────────────────────────────────────────────────────────

describe('parseProtobuf', () => {
  it('extracts fields from a proto3 message', () => {
    const proto = `
syntax = "proto3";
message Order {
  string order_id = 1;
  int32 quantity = 2;
  float amount = 3;
}`;
    expect(names(parseProtobuf(proto))).toEqual(
      expect.arrayContaining(['order_id', 'quantity', 'amount']),
    );
  });

  it('handles proto2 required/optional/repeated modifiers', () => {
    const proto = `
message Item {
  required string sku = 1;
  optional string description = 2;
  repeated string tags = 3;
}`;
    expect(names(parseProtobuf(proto))).toEqual(
      expect.arrayContaining(['sku', 'description', 'tags']),
    );
  });

  it('does not include proto keywords as field names', () => {
    const proto = `
syntax = "proto3";
package com.example;
import "google/protobuf/timestamp.proto";
message Foo {
  string name = 1;
}`;
    const result = names(parseProtobuf(proto));
    expect(result).not.toContain('syntax');
    expect(result).not.toContain('package');
    expect(result).not.toContain('import');
    expect(result).toContain('name');
  });

  it('deduplicates fields across multiple messages', () => {
    const proto = `
message A {
  string id = 1;
}
message B {
  string id = 1;
}`;
    expect(names(parseProtobuf(proto)).filter(n => n === 'id')).toHaveLength(1);
  });

  it('returns empty array for empty input', () => {
    expect(parseProtobuf('')).toEqual([]);
  });

  it('does not extract map field type parameters as field names', () => {
    // map<K,V> fields: the current regex-based parser does not extract these
    // (map<string, int32> doesn't match the type-name pattern) — documented behavior
    const proto = `
message Labels {
  map<string, string> attributes = 1;
  string name = 2;
}`;
    const result = names(parseProtobuf(proto));
    // map field is not extracted — known limitation of regex approach
    expect(result).not.toContain('string');
    expect(result).not.toContain('attributes');
    // regular fields still work
    expect(result).toContain('name');
  });

  it('handles google.protobuf well-known types as field types', () => {
    const proto = `
message Event {
  google.protobuf.Timestamp occurred_at = 1;
  google.protobuf.StringValue label = 2;
}`;
    expect(names(parseProtobuf(proto))).toEqual(
      expect.arrayContaining(['occurred_at', 'label']),
    );
  });
});
