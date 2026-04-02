/**
 * schema-bridge — Avro type mapping exhaustive matrix
 */
import { describe, it, expect } from 'vitest';
import { AvroSchemaAdapter } from '../../src/adapters/avro-adapter.js';

function makeRecord(fields: Array<{ name: string; type: unknown; default?: unknown }>) {
  return { type: 'record', name: 'T', fields };
}

function adaptField(type: unknown, opts?: { default?: unknown }) {
  const field: Record<string, unknown> = { name: 'f', type };
  if (opts?.default !== undefined) field['default'] = opts.default;
  return new AvroSchemaAdapter(makeRecord([field])).adapt().fields[0];
}

// ─── Primitive type mapping matrix ────────────────────────────────────────────

describe('Avro primitive → JSON type', () => {
  const primitives: Array<{ avro: string; expectedType: string }> = [
    { avro: 'null', expectedType: 'null' },
    { avro: 'boolean', expectedType: 'boolean' },
    { avro: 'int', expectedType: 'number' },
    { avro: 'long', expectedType: 'number' },
    { avro: 'float', expectedType: 'number' },
    { avro: 'double', expectedType: 'number' },
    { avro: 'bytes', expectedType: 'string' },
    { avro: 'string', expectedType: 'string' },
    { avro: 'enum', expectedType: 'string' },
    { avro: 'fixed', expectedType: 'string' },
    { avro: 'map', expectedType: 'object' },
    { avro: 'record', expectedType: 'object' },
    { avro: 'array', expectedType: 'array' },
  ];

  it.each(primitives)('$avro → $expectedType', ({ avro, expectedType }) => {
    const f = adaptField(avro);
    expect(f.node.type).toBe(expectedType);
  });
});

// ─── Logical type mapping matrix ──────────────────────────────────────────────

describe('Avro logicalType → JSON type + format', () => {
  const logicalTypes: Array<{ logicalType: string; baseType: string; expectedJsonType: string; expectedFormat: string }> = [
    { logicalType: 'date', baseType: 'int', expectedJsonType: 'string', expectedFormat: 'date' },
    { logicalType: 'time-millis', baseType: 'int', expectedJsonType: 'string', expectedFormat: 'time' },
    { logicalType: 'time-micros', baseType: 'long', expectedJsonType: 'string', expectedFormat: 'time' },
    { logicalType: 'timestamp-millis', baseType: 'long', expectedJsonType: 'string', expectedFormat: 'date-time' },
    { logicalType: 'timestamp-micros', baseType: 'long', expectedJsonType: 'string', expectedFormat: 'date-time' },
    { logicalType: 'local-timestamp-millis', baseType: 'long', expectedJsonType: 'string', expectedFormat: 'date-time' },
    { logicalType: 'local-timestamp-micros', baseType: 'long', expectedJsonType: 'string', expectedFormat: 'date-time' },
    { logicalType: 'uuid', baseType: 'string', expectedJsonType: 'string', expectedFormat: 'uuid' },
    { logicalType: 'decimal', baseType: 'bytes', expectedJsonType: 'number', expectedFormat: '' },
    { logicalType: 'duration', baseType: 'fixed', expectedJsonType: 'string', expectedFormat: '' },
  ];

  it.each(logicalTypes)('logicalType=$logicalType → $expectedJsonType ($expectedFormat)', ({ logicalType, baseType, expectedJsonType, expectedFormat }) => {
    const avroType = { type: baseType, logicalType, precision: 10, scale: 2, size: 12 };
    const f = adaptField(avroType);
    expect(f.node.type).toBe(expectedJsonType);
    if (expectedFormat) expect(f.node.format).toBe(expectedFormat);
  });
});

// ─── Nullable union matrix ────────────────────────────────────────────────────

describe('Nullable union ["null", X] → nullable=true', () => {
  const nullableTypes: Array<{ inner: unknown; expectedType: string }> = [
    { inner: 'string', expectedType: 'string' },
    { inner: 'int', expectedType: 'number' },
    { inner: 'long', expectedType: 'number' },
    { inner: 'float', expectedType: 'number' },
    { inner: 'double', expectedType: 'number' },
    { inner: 'boolean', expectedType: 'boolean' },
    { inner: 'bytes', expectedType: 'string' },
    { inner: { type: 'long', logicalType: 'timestamp-millis' }, expectedType: 'string' },
    { inner: { type: 'int', logicalType: 'date' }, expectedType: 'string' },
    { inner: { type: 'string', logicalType: 'uuid' }, expectedType: 'string' },
    { inner: { type: 'bytes', logicalType: 'decimal' }, expectedType: 'number' },
  ];

  it.each(nullableTypes)('["null", $expectedType] → nullable=true', ({ inner, expectedType }) => {
    const f = adaptField(['null', inner], { default: null });
    expect(f.node.nullable).toBe(true);
    expect(f.node.type).toBe(expectedType);
    expect(f.required).toBe(false);
  });

  it('["null"] union → type=null, nullable=true', () => {
    const f = adaptField(['null']);
    expect(f.node.type).toBe('null');
    expect(f.node.nullable).toBe(true);
  });

  it('non-nullable string → nullable=false', () => {
    const f = adaptField('string');
    expect(f.node.nullable).toBe(false);
    expect(f.required).toBe(true);
  });
});

// ─── Required/optional detection matrix ──────────────────────────────────────

describe('Required field detection', () => {
  const requiredCases: Array<{ type: unknown; hasDefault: boolean; expectedRequired: boolean }> = [
    { type: 'string', hasDefault: false, expectedRequired: true },
    { type: 'int', hasDefault: false, expectedRequired: true },
    { type: 'boolean', hasDefault: false, expectedRequired: true },
    { type: 'string', hasDefault: true, expectedRequired: false },
    { type: 'int', hasDefault: true, expectedRequired: false },
    { type: ['null', 'string'], hasDefault: true, expectedRequired: false },
    { type: ['null', 'string'], hasDefault: false, expectedRequired: false },
  ];

  it.each(requiredCases)('type=$type default=$hasDefault → required=$expectedRequired', ({ type, hasDefault, expectedRequired }) => {
    const f = adaptField(type, hasDefault ? { default: null } : undefined);
    expect(f.required).toBe(expectedRequired);
  });
});

// ─── Complex schema matrix ────────────────────────────────────────────────────

describe('Complex multi-field schemas', () => {
  const paymentSchema = {
    type: 'record', name: 'Payment',
    fields: [
      { name: 'id', type: { type: 'string', logicalType: 'uuid' } },
      { name: 'amount', type: { type: 'bytes', logicalType: 'decimal', precision: 10, scale: 2 } },
      { name: 'currency', type: 'string' },
      { name: 'status', type: { type: 'enum', name: 'PaymentStatus', symbols: ['pending', 'approved', 'rejected'] } },
      { name: 'created_at', type: { type: 'long', logicalType: 'timestamp-millis' } },
      { name: 'approved_at', type: ['null', { type: 'long', logicalType: 'timestamp-millis' }], default: null },
      { name: 'payer_email', type: ['null', 'string'], default: null },
      { name: 'installments', type: 'int', default: 1 },
    ],
  };

  it('adapts Payment schema with 8 fields', () => {
    const schema = new AvroSchemaAdapter(paymentSchema).adapt();
    expect(schema.fields).toHaveLength(8);
  });

  it('Payment.id is uuid format', () => {
    const schema = new AvroSchemaAdapter(paymentSchema).adapt();
    const id = schema.fields.find(f => f.path === 'id')!;
    expect(id.node.format).toBe('uuid');
  });

  it('Payment.amount is number (decimal)', () => {
    const schema = new AvroSchemaAdapter(paymentSchema).adapt();
    const amt = schema.fields.find(f => f.path === 'amount')!;
    expect(amt.node.type).toBe('number');
  });

  it('Payment.created_at is date-time format', () => {
    const schema = new AvroSchemaAdapter(paymentSchema).adapt();
    const ts = schema.fields.find(f => f.path === 'created_at')!;
    expect(ts.node.format).toBe('date-time');
  });

  it('Payment.approved_at is nullable', () => {
    const schema = new AvroSchemaAdapter(paymentSchema).adapt();
    const ts = schema.fields.find(f => f.path === 'approved_at')!;
    expect(ts.node.nullable).toBe(true);
  });

  it('Payment.installments has default → not required', () => {
    const schema = new AvroSchemaAdapter(paymentSchema).adapt();
    const inst = schema.fields.find(f => f.path === 'installments')!;
    expect(inst.required).toBe(false);
  });

  const latamInvoiceSchema = {
    type: 'record', name: 'AFIPInvoice',
    fields: [
      { name: 'nro_comprobante', type: 'string' },
      { name: 'cuit_receptor', type: 'string' },
      { name: 'importe_total', type: { type: 'bytes', logicalType: 'decimal', precision: 12, scale: 2 } },
      { name: 'fecha_emision', type: { type: 'int', logicalType: 'date' } },
      { name: 'tipo_iva', type: 'string' },
      { name: 'cae', type: ['null', 'string'], default: null },
      { name: 'cae_vencimiento', type: ['null', { type: 'int', logicalType: 'date' }], default: null },
    ],
  };

  it('adapts AFIP invoice schema with 7 fields', () => {
    const schema = new AvroSchemaAdapter(latamInvoiceSchema).adapt();
    expect(schema.fields).toHaveLength(7);
  });

  it('AFIP.fecha_emision is date format', () => {
    const schema = new AvroSchemaAdapter(latamInvoiceSchema).adapt();
    const f = schema.fields.find(f => f.path === 'fecha_emision')!;
    expect(f.node.format).toBe('date');
  });

  it('AFIP.cae is nullable optional', () => {
    const schema = new AvroSchemaAdapter(latamInvoiceSchema).adapt();
    const f = schema.fields.find(f => f.path === 'cae')!;
    expect(f.node.nullable).toBe(true);
    expect(f.required).toBe(false);
  });

  // Fingerprint stability
  it('same schema always produces same fingerprint', () => {
    const fp1 = new AvroSchemaAdapter(paymentSchema).adapt().fingerprint;
    const fp2 = new AvroSchemaAdapter(paymentSchema).adapt().fingerprint;
    expect(fp1).toBe(fp2);
  });

  it('different schemas produce different fingerprints', () => {
    const fp1 = new AvroSchemaAdapter(paymentSchema).adapt().fingerprint;
    const fp2 = new AvroSchemaAdapter(latamInvoiceSchema).adapt().fingerprint;
    expect(fp1).not.toBe(fp2);
  });
});

// ─── String schema input ──────────────────────────────────────────────────────

describe('String input', () => {
  const schemas = [
    '{"type":"record","name":"A","fields":[{"name":"x","type":"string"}]}',
    '{"type":"record","name":"B","fields":[{"name":"id","type":{"type":"string","logicalType":"uuid"}},{"name":"ts","type":{"type":"long","logicalType":"timestamp-millis"}}]}',
    '{"type":"record","name":"C","fields":[{"name":"a","type":"int"},{"name":"b","type":"boolean"},{"name":"c","type":["null","string"],"default":null}]}',
  ];

  it.each(schemas)('parses JSON string schema', (schemaStr) => {
    const schema = new AvroSchemaAdapter(schemaStr).adapt();
    expect(schema.fields.length).toBeGreaterThan(0);
    expect(schema.fingerprint).toHaveLength(32);
  });
});
