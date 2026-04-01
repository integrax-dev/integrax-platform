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
    expect(schema.fields).toEqual([
      { path: 'id', required: true, node: { type: 'string', nullable: false, examples: [] } },
      { path: 'first_name', required: true, node: { type: 'string', nullable: false, examples: [] } },
      { path: 'age', required: false, node: { type: 'number', nullable: true, examples: [] } },
      { path: 'is_active', required: true, node: { type: 'boolean', nullable: false, examples: [] } },
      { path: 'created_at', required: false, node: { type: 'string', nullable: true, examples: [] } },
    ]);
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
