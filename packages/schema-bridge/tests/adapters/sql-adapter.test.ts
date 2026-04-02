import { describe, it, expect } from 'vitest';
import { SqlDdlAdapter } from '../../src/adapters/sql-adapter.js';

describe('SqlDdlAdapter', () => {
  it('parses a basic CREATE TABLE statement', () => {
    const ddl = `
      CREATE TABLE users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE,
        age INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;
    const adapter = new SqlDdlAdapter(ddl);
    const inferred = adapter.adapt();

    expect(inferred.fields).toHaveLength(5);
    
    const idField = inferred.fields.find(f => f.path === 'id');
    expect(idField?.node.type).toBe('number');
    expect(idField?.required).toBe(true);

    const emailField = inferred.fields.find(f => f.path === 'email');
    expect(emailField?.node.type).toBe('string');
    expect(emailField?.required).toBe(false);
  });

  it('handles table-level primary keys', () => {
    const ddl = `
      CREATE TABLE order_items (
        order_id INT,
        item_id INT,
        quantity INT NOT NULL,
        PRIMARY KEY (order_id, item_id)
      );
    `;
    const adapter = new SqlDdlAdapter(ddl);
    const inferred = adapter.adapt();

    const orderId = inferred.fields.find(f => f.path === 'order_id');
    const itemId = inferred.fields.find(f => f.path === 'item_id');
    
    expect(orderId?.required).toBe(true);
    expect(itemId?.required).toBe(true);
  });

  it('strips comments and handles formatting', () => {
    const ddl = `
      -- Internal users table
      CREATE TABLE /* temp */ employees (
        emp_id INT -- identifier
        /* multiline 
           comment */
      );
    `;
    const adapter = new SqlDdlAdapter(ddl);
    const inferred = adapter.adapt();
    expect(inferred.fields[0].path).toBe('emp_id');
  });
});
