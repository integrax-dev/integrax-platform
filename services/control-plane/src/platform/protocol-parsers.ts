/**
 * Protocol-specific schema field extractors.
 *
 * Each function receives a raw string payload and returns a list of named fields
 * suitable for fingerprinting by schema-bridge. No external parser dependencies —
 * all implementations use only JSON.parse and regex so they add zero bundle weight.
 *
 * Exported so they can be unit-tested independently of DriftService.
 */

import type { SchemaField, SchemaNode } from '@integrax/schema-bridge';

function node(nullable: boolean): SchemaNode {
  return {
    type: 'string',
    nullable,
    examples: [],
  };
}

function field(path: string, nullable = false): SchemaField {
  return { path, required: true, node: node(nullable) };
}

// ─── CSV ──────────────────────────────────────────────────────────────────────

/**
 * Parse the header row of a CSV string.
 * Handles quoted column names and ignores sample data rows.
 *
 * @example parseCsv('id,"full name",email\n1,Alice,a@b.com') → ['id','full name','email']
 */
export function parseCsv(raw: string): SchemaField[] {
  // Normalize CRLF → LF so Windows/Metabase exports work correctly
  const normalized = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const header = normalized.split('\n').find(l => l.trim().length > 0) ?? '';
  const cols = header
    .split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/)   // split on commas outside quotes
    .map(c => c.trim().replace(/^"|"$/g, ''));
  return cols.filter(Boolean).map(name => field(name));
}

// ─── JSONL ────────────────────────────────────────────────────────────────────

/**
 * Infer schema from the first JSON object in a JSONL / NDJSON stream.
 *
 * @example parseJsonl('{"id":1,"name":"x"}\n{"id":2,"name":"y"}') → ['id','name']
 */
export function parseJsonl(raw: string): SchemaField[] {
  const firstLine = raw.split('\n').find(l => l.trim().startsWith('{'));
  if (!firstLine) return [];
  try {
    return Object.keys(JSON.parse(firstLine) as Record<string, unknown>).map(name => field(name));
  } catch {
    return [];
  }
}

// ─── Avro ─────────────────────────────────────────────────────────────────────

/**
 * Extract fields from an Avro schema JSON.
 * Accepts both `{ fields: [...] }` and `{ type: 'record', fields: [...] }` shapes.
 * A union type `["null", "string"]` marks the field as nullable.
 *
 * @example parseAvro('{"type":"record","fields":[{"name":"id","type":"int"}]}') → ['id']
 */
export function parseAvro(raw: string): SchemaField[] {
  try {
    const schema = JSON.parse(raw) as Record<string, unknown>;
    const rawFields = (schema['fields'] ?? (schema['schema'] as Record<string, unknown>)?.['fields'] ?? []) as Array<Record<string, unknown>>;
    return rawFields.map(f => field(
      String(f['name'] ?? f),
      Array.isArray(f['type']) && (f['type'] as unknown[]).includes('null'),
    ));
  } catch {
    return [];
  }
}

// ─── XML / SOAP ───────────────────────────────────────────────────────────────

/**
 * Extract unique element and attribute local-names from an XML document.
 * Namespace prefixes are stripped (`xs:element` → `element`).
 * `xmlns` pseudo-attribute is excluded.
 *
 * Works for both generic XML and WSDL/XSD (SOAP) documents.
 *
 * @example parseXml('<root><id>1</id><name type="string">x</name></root>') → ['root','id','name','type']
 */
export function parseXml(raw: string): SchemaField[] {
  const seen = new Set<string>();

  for (const [, tag] of raw.matchAll(/<([A-Za-z][A-Za-z0-9_:.-]*)[^>]*>/g)) {
    const local = tag.includes(':') ? tag.split(':')[1] : tag;
    if (local) seen.add(local);
  }

  for (const [, attr] of raw.matchAll(/\s([A-Za-z][A-Za-z0-9_:.-]*)=["']/g)) {
    const local = attr.includes(':') ? attr.split(':')[1] : attr;
    if (local && local !== 'xmlns') seen.add(local);
  }

  return [...seen].map(name => field(name));
}

// ─── GraphQL SDL ──────────────────────────────────────────────────────────────

/**
 * Extract field names from a GraphQL SDL string.
 * Matches indented `fieldName: Type` patterns inside type/input/interface blocks.
 * No AST parser dependency needed for schema fingerprinting.
 *
 * @example parseGraphql('type User {\n  id: ID!\n  name: String\n}') → ['id','name']
 */
export function parseGraphql(raw: string): SchemaField[] {
  const seen = new Set<string>();
  for (const [, f] of raw.matchAll(/^\s{2,}([A-Za-z_][A-Za-z0-9_]*)\s*(?:\([^)]*\))?\s*:/gm)) {
    seen.add(f);
  }
  return [...seen].map(name => field(name));
}

// ─── Parquet ──────────────────────────────────────────────────────────────────

/**
 * Extract column definitions from a Parquet schema.
 *
 * Accepts multiple common representations:
 *   - `{ columns: [{ name, type, nullable }] }` — generic REST API style
 *   - `{ fields: [{ name, type }] }` — Arrow / Spark style
 *   - `{ schema: { fields: [...] } }` — PyArrow repr
 *   - Parquet DDL text: `message Foo { required binary name; optional int32 age; }`
 *
 * @example parseParquet('{"columns":[{"name":"id"},{"name":"ts"}]}') → ['id','ts']
 */
export function parseParquet(raw: string): SchemaField[] {
  try {
    const obj = JSON.parse(raw) as Record<string, unknown>;
    const schemaObj = obj['schema'] as Record<string, unknown> | undefined;
    const cols = (obj['columns'] ?? obj['fields'] ?? schemaObj?.['fields'] ?? schemaObj?.['columns'] ?? []) as Array<Record<string, unknown>>;
    if (cols.length > 0) {
      return cols.map(c => field(
        String(c['name'] ?? c['field_name'] ?? c),
        (c['nullable'] as boolean | undefined) ?? false,
      ));
    }
  } catch { /* fall through to DDL parser */ }

  // Parquet DDL: "required/optional <logical_type> <name>;" lines
  const seen = new Set<string>();
  for (const [, name] of raw.matchAll(/(?:required|optional)\s+\S+\s+([A-Za-z_][A-Za-z0-9_.]*)\s*[;(]/g)) {
    seen.add(name);
  }
  return [...seen].map(name => field(name));
}

// ─── Protobuf ─────────────────────────────────────────────────────────────────

/**
 * Extract field names from a Protocol Buffer `.proto` message definition.
 * Handles proto2 (`required`/`optional`/`repeated`) and proto3 (bare type).
 * Excludes reserved keywords that incidentally match the pattern.
 *
 * @example parseProtobuf('message User { string name = 1; int32 age = 2; }') → ['name','age']
 */
export function parseProtobuf(raw: string): SchemaField[] {
  const KEYWORDS = new Set([
    'message', 'enum', 'service', 'rpc', 'returns', 'option',
    'syntax', 'package', 'import', 'oneof', 'map', 'extensions', 'reserved',
  ]);
  const seen = new Set<string>();
  for (const [, name] of raw.matchAll(
    /^\s*(?:repeated\s+|optional\s+|required\s+)?[A-Za-z_][A-Za-z0-9_.]*\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*\d+\s*;/gm,
  )) {
    if (!KEYWORDS.has(name)) seen.add(name);
  }
  return [...seen].map(name => field(name));
}
