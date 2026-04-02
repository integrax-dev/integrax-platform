import { describe, it, expect } from 'vitest';
import { CsvAdapter } from '../../src/adapters/csv-adapter.js';

describe('CsvAdapter', () => {
  it('parses a basic CSV with numeric and text columns', () => {
    const csv = `id,name,age\n1,Juan,25\n2,Maria,30\n3,Pedro,35`;
    const adapter = new CsvAdapter(csv);
    const inferred = adapter.adapt();

    expect(inferred.fields).toHaveLength(3);
    
    const idField = inferred.fields.find(f => f.path === 'id');
    expect(idField?.node.type).toBe('number');
    expect(idField?.required).toBe(true);

    const nameField = inferred.fields.find(f => f.path === 'name');
    expect(nameField?.node.type).toBe('string');
    expect(nameField?.required).toBe(true);
  });

  it('infers booleans correctly', () => {
    const csv = `is_active\ntrue\nfalse\ntrue`;
    const adapter = new CsvAdapter(csv);
    const inferred = adapter.adapt();

    const activeField = inferred.fields.find(f => f.path === 'is_active');
    expect(activeField?.node.type).toBe('boolean');
  });

  it('handles missing values (nullable)', () => {
    const csv = `id,opt_val\n1,ok\n2,`;
    const adapter = new CsvAdapter(csv);
    const inferred = adapter.adapt();

    const optField = inferred.fields.find(f => f.path === 'opt_val');
    expect(optField?.node.nullable).toBe(true);
    expect(optField?.required).toBe(false);
  });
});
