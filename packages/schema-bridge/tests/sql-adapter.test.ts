import { describe, expect, it } from 'vitest';
import { SqlDdlAdapter } from '../src/adapters/sql-adapter.js';
import { sqlDdlFixtures } from './fixtures/synthetic-scenarios.js';

describe('SqlDdlAdapter', () => {
  for (const fixture of sqlDdlFixtures) {
    it(`adapts ${fixture.key}`, () => {
      const adapter = new SqlDdlAdapter(fixture.ddl);
      const schema = adapter.adapt();
      const byPath = Object.fromEntries(schema.fields.map(field => [field.path, field]));

      expect(schema.fields).toHaveLength(fixture.expectedFields.length);

      for (const expectedField of fixture.expectedFields) {
        expect(byPath[expectedField.path], `Missing ${expectedField.path} in ${fixture.key}`).toBeDefined();
        expect(byPath[expectedField.path].required).toBe(expectedField.required);
        expect(byPath[expectedField.path].node.type).toBe(expectedField.type);
        expect(byPath[expectedField.path].node.nullable).toBe(expectedField.nullable);
        expect(byPath[expectedField.path].node.format).toBe(expectedField.format);
      }

      expect(schema.fingerprint).toHaveLength(32);
      expect(schema.sampleCount).toBe(0);
    });
  }

  it('creates a stable fingerprint regardless of column order', () => {
    const ddlA = `
      CREATE TABLE one (
        id UUID NOT NULL,
        amount DECIMAL(10,2),
        created_at TIMESTAMP
      );
    `;
    const ddlB = `
      CREATE TABLE two (
        created_at TIMESTAMP,
        amount DECIMAL(10,2),
        id UUID NOT NULL
      );
    `;

    const schemaA = new SqlDdlAdapter(ddlA).adapt();
    const schemaB = new SqlDdlAdapter(ddlB).adapt();

    expect(schemaA.fingerprint).toBe(schemaB.fingerprint);
  });

  it('throws when the ddl does not contain a create table statement', () => {
    const adapter = new SqlDdlAdapter('ALTER TABLE users ADD COLUMN age INT;');
    expect(() => adapter.adapt()).toThrow('Invalid SQL DDL: Could not find column definitions.');
  });

  it('treats unknown SQL types as strings instead of crashing', () => {
    const ddl = `
      CREATE TABLE custom_types (
        external_ref HIERARCHYID NOT NULL,
        payload XML
      );
    `;

    const schema = new SqlDdlAdapter(ddl).adapt();
    const byPath = Object.fromEntries(schema.fields.map(field => [field.path, field]));

    expect(byPath.external_ref.node.type).toBe('string');
    expect(byPath.external_ref.required).toBe(true);
    expect(byPath.payload.node.type).toBe('string');
    expect(byPath.payload.required).toBe(false);
  });
});
