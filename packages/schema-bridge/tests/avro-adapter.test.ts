import { describe, expect, it } from 'vitest';
import { AvroSchemaAdapter } from '../src/adapters/avro-adapter.js';

describe('AvroSchemaAdapter', () => {
  it('adapts a simple flat record', () => {
    const avro = {
      type: 'record',
      name: 'Payment',
      fields: [
        { name: 'id', type: 'string' },
        { name: 'amount', type: 'double' },
        { name: 'approved', type: 'boolean' },
      ],
    };

    const schema = new AvroSchemaAdapter(avro).adapt();
    const byPath = Object.fromEntries(schema.fields.map(f => [f.path, f]));

    expect(schema.fields).toHaveLength(3);
    expect(byPath['id'].node.type).toBe('string');
    expect(byPath['id'].required).toBe(true);
    expect(byPath['amount'].node.type).toBe('number');
    expect(byPath['approved'].node.type).toBe('boolean');
  });

  it('maps nullable union ["null", "string"] to nullable=true, required=false', () => {
    const avro = {
      type: 'record',
      name: 'Customer',
      fields: [
        { name: 'email', type: ['null', 'string'], default: null },
        { name: 'name', type: 'string' },
      ],
    };

    const schema = new AvroSchemaAdapter(avro).adapt();
    const byPath = Object.fromEntries(schema.fields.map(f => [f.path, f]));

    expect(byPath['email'].node.nullable).toBe(true);
    expect(byPath['email'].required).toBe(false);
    expect(byPath['name'].node.nullable).toBe(false);
    expect(byPath['name'].required).toBe(true);
  });

  it('maps logicalType=timestamp-millis to type=string, format=date-time', () => {
    const avro = {
      type: 'record',
      name: 'Event',
      fields: [
        { name: 'created_at', type: { type: 'long', logicalType: 'timestamp-millis' } },
        { name: 'event_date', type: { type: 'int', logicalType: 'date' } },
        { name: 'event_id', type: { type: 'string', logicalType: 'uuid' } },
      ],
    };

    const schema = new AvroSchemaAdapter(avro).adapt();
    const byPath = Object.fromEntries(schema.fields.map(f => [f.path, f]));

    expect(byPath['created_at'].node.type).toBe('string');
    expect(byPath['created_at'].node.format).toBe('date-time');
    expect(byPath['event_date'].node.type).toBe('string');
    expect(byPath['event_date'].node.format).toBe('date');
    expect(byPath['event_id'].node.type).toBe('string');
    expect(byPath['event_id'].node.format).toBe('uuid');
  });

  it('maps logicalType=decimal to type=number', () => {
    const avro = {
      type: 'record',
      name: 'Invoice',
      fields: [
        { name: 'total', type: { type: 'bytes', logicalType: 'decimal', precision: 10, scale: 2 } },
      ],
    };

    const schema = new AvroSchemaAdapter(avro).adapt();
    expect(schema.fields[0].node.type).toBe('number');
  });

  it('flattens a nested record into dot-notation paths', () => {
    const avro = {
      type: 'record',
      name: 'Order',
      fields: [
        { name: 'order_id', type: 'string' },
        {
          name: 'customer',
          type: {
            type: 'record',
            name: 'Customer',
            fields: [
              { name: 'id', type: 'string' },
              { name: 'email', type: ['null', 'string'], default: null },
            ],
          },
        },
      ],
    };

    const schema = new AvroSchemaAdapter(avro).adapt();
    const paths = schema.fields.map(f => f.path);

    expect(paths).toContain('order_id');
    expect(paths).toContain('customer.id');
    expect(paths).toContain('customer.email');
    expect(paths).not.toContain('customer'); // intermediate record not emitted
  });

  it('accepts a JSON string instead of an object', () => {
    const avroStr = JSON.stringify({
      type: 'record',
      name: 'Item',
      fields: [{ name: 'sku', type: 'string' }],
    });

    const schema = new AvroSchemaAdapter(avroStr).adapt();
    expect(schema.fields).toHaveLength(1);
    expect(schema.fields[0].path).toBe('sku');
  });

  it('throws when schema is not a record type', () => {
    const avro = { type: 'array', items: 'string' };
    expect(() => new AvroSchemaAdapter(avro).adapt()).toThrow(
      'Invalid Avro schema: expected a top-level record type with fields array.',
    );
  });

  it('produces a stable 32-char fingerprint', () => {
    const avro = {
      type: 'record',
      name: 'T',
      fields: [
        { name: 'a', type: 'string' },
        { name: 'b', type: 'int' },
      ],
    };

    const s1 = new AvroSchemaAdapter(avro).adapt();
    expect(s1.fingerprint).toHaveLength(32);
  });

  it('produces identical fingerprint regardless of field order', () => {
    const avroA = {
      type: 'record', name: 'T',
      fields: [{ name: 'x', type: 'string' }, { name: 'y', type: 'int' }],
    };
    const avroB = {
      type: 'record', name: 'T',
      fields: [{ name: 'y', type: 'int' }, { name: 'x', type: 'string' }],
    };

    const fpA = new AvroSchemaAdapter(avroA).adapt().fingerprint;
    const fpB = new AvroSchemaAdapter(avroB).adapt().fingerprint;
    expect(fpA).toBe(fpB);
  });

  it('marks field with default value as not required', () => {
    const avro = {
      type: 'record',
      name: 'Config',
      fields: [
        { name: 'retries', type: 'int', default: 3 },
        { name: 'queue', type: 'string' },
      ],
    };

    const schema = new AvroSchemaAdapter(avro).adapt();
    const byPath = Object.fromEntries(schema.fields.map(f => [f.path, f]));

    expect(byPath['retries'].required).toBe(false);
    expect(byPath['queue'].required).toBe(true);
  });
});
