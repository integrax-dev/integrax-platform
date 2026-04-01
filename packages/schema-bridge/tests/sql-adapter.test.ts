import { describe, expect, it } from 'vitest';
import { SqlDdlAdapter } from '../src/adapters/sql-adapter.js';

describe('SqlDdlAdapter', () => {
  it('debe parsear un DDL básico correctamente', () => {
    const ddl = `
      CREATE TABLE users (
        id UUID PRIMARY KEY,
        first_name VARCHAR(100) NOT NULL,
        age INT,
        is_active BOOLEAN NOT NULL,
        created_at TIMESTAMP
      );
    `;

    const adapter = new SqlDdlAdapter(ddl);
    const schema = adapter.adapt();

    expect(schema.fields).toHaveLength(5);
    const byPath = Object.fromEntries(schema.fields.map(f => [f.path, f]));
    expect(byPath['id'].required).toBe(true);
    expect(byPath['id'].node.type).toBe('string');
    expect(byPath['id'].node.nullable).toBe(false);
    expect(byPath['first_name'].required).toBe(true);
    expect(byPath['first_name'].node.type).toBe('string');
    expect(byPath['age'].required).toBe(false);
    expect(byPath['age'].node.type).toBe('number');
    expect(byPath['age'].node.nullable).toBe(true);
    expect(byPath['is_active'].required).toBe(true);
    expect(byPath['is_active'].node.type).toBe('boolean');
    expect(byPath['created_at'].required).toBe(false);
    expect(byPath['created_at'].node.type).toBe('string');
    expect(byPath['created_at'].node.format).toBe('date-time');
  });

  it('debe ignorar table-level constraints', () => {
    const ddl = `
      CREATE TABLE orders (
        order_id INT NOT NULL,
        amount DECIMAL(10,2),
        PRIMARY KEY (order_id),
        CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `;

    const adapter = new SqlDdlAdapter(ddl);
    const schema = adapter.adapt();

    // Solo debe reconocer 'order_id' y 'amount'
    expect(schema.fields.map((f: any) => f.path)).toEqual(['order_id', 'amount']);
    expect(schema.fields.find((f: any) => f.path === 'amount')?.node.type).toBe('number');
  });
});
