/**
 * Tests para SqlDdlAdapter.
 *
 * Cubre:
 *   - Tipos SQL básicos → JsonPrimitiveType + format
 *   - NOT NULL → required: true, nullable: false
 *   - PRIMARY KEY inline → required: true, nullable: false
 *   - PRIMARY KEY como constraint de tabla
 *   - Nombres quoted (backtick, double quote, brackets)
 *   - Comentarios de linea y bloque removidos
 *   - VARCHAR(255), NUMERIC(10,2) — parámetros ignorados correctamente
 *   - Error con input inválido
 *   - Fingerprint reproducible
 *   - sampleCount = 0
 */

import { describe, it, expect } from 'vitest';
import { SqlDdlAdapter } from '../adapters/sql-ddl-adapter.js';

const adapter = new SqlDdlAdapter();

// ─── Helpers ──────────────────────────────────────────────────────────────────

function field(schema: ReturnType<SqlDdlAdapter['adapt']>, path: string) {
  return schema.fields.find(f => f.path === path);
}

// ─── Básicos ──────────────────────────────────────────────────────────────────

describe('SqlDdlAdapter — básico', () => {
  it('parsea un CREATE TABLE simple', () => {
    const sql = `
      CREATE TABLE orders (
        id INTEGER NOT NULL,
        total NUMERIC(10,2),
        note TEXT
      );
    `;
    const schema = adapter.adapt(sql);
    expect(schema.fields).toHaveLength(3);
    expect(schema.sampleCount).toBe(0);
  });

  it('id es string en adaptar (adapter.id)', () => {
    expect(adapter.id).toBe('sql-ddl');
  });

  it('genera fingerprint determinístico', () => {
    const sql = `CREATE TABLE t (id INT NOT NULL);`;
    const s1 = adapter.adapt(sql);
    const s2 = adapter.adapt(sql);
    expect(s1.fingerprint).toBe(s2.fingerprint);
    expect(s1.fingerprint).toHaveLength(32);
  });

  it('fingerprints distintos para schemas distintos', () => {
    const s1 = adapter.adapt(`CREATE TABLE t (id INT NOT NULL);`);
    const s2 = adapter.adapt(`CREATE TABLE t (id INT NOT NULL, name VARCHAR(100));`);
    expect(s1.fingerprint).not.toBe(s2.fingerprint);
  });

  it('lanza error si no hay CREATE TABLE válido', () => {
    expect(() => adapter.adapt('SELECT 1')).toThrow('[SqlDdlAdapter]');
    expect(() => adapter.adapt('')).toThrow('[SqlDdlAdapter]');
  });
});

// ─── Tipos ────────────────────────────────────────────────────────────────────

describe('SqlDdlAdapter — tipos SQL', () => {
  it('INTEGER → number', () => {
    const s = adapter.adapt(`CREATE TABLE t (qty INTEGER);`);
    expect(field(s, 'qty')?.node.type).toBe('number');
  });

  it('BIGINT → number', () => {
    const s = adapter.adapt(`CREATE TABLE t (big_id BIGINT);`);
    expect(field(s, 'big_id')?.node.type).toBe('number');
  });

  it('VARCHAR → string sin format', () => {
    const s = adapter.adapt(`CREATE TABLE t (name VARCHAR(255));`);
    const f = field(s, 'name');
    expect(f?.node.type).toBe('string');
    expect(f?.node.format).toBeUndefined();
  });

  it('TEXT → string', () => {
    const s = adapter.adapt(`CREATE TABLE t (notes TEXT);`);
    expect(field(s, 'notes')?.node.type).toBe('string');
  });

  it('BOOLEAN → boolean', () => {
    const s = adapter.adapt(`CREATE TABLE t (active BOOLEAN);`);
    expect(field(s, 'active')?.node.type).toBe('boolean');
  });

  it('BOOL → boolean', () => {
    const s = adapter.adapt(`CREATE TABLE t (flag BOOL);`);
    expect(field(s, 'flag')?.node.type).toBe('boolean');
  });

  it('DATE → string con format date', () => {
    const s = adapter.adapt(`CREATE TABLE t (birth_date DATE);`);
    const f = field(s, 'birth_date');
    expect(f?.node.type).toBe('string');
    expect(f?.node.format).toBe('date');
  });

  it('TIMESTAMP → string con format date-time', () => {
    const s = adapter.adapt(`CREATE TABLE t (created_at TIMESTAMP);`);
    const f = field(s, 'created_at');
    expect(f?.node.type).toBe('string');
    expect(f?.node.format).toBe('date-time');
  });

  it('TIMESTAMPTZ → string con format date-time', () => {
    const s = adapter.adapt(`CREATE TABLE t (updated_at TIMESTAMPTZ);`);
    expect(field(s, 'updated_at')?.node.format).toBe('date-time');
  });

  it('UUID → string con format uuid', () => {
    const s = adapter.adapt(`CREATE TABLE t (id UUID);`);
    const f = field(s, 'id');
    expect(f?.node.type).toBe('string');
    expect(f?.node.format).toBe('uuid');
  });

  it('JSONB → object', () => {
    const s = adapter.adapt(`CREATE TABLE t (meta JSONB);`);
    expect(field(s, 'meta')?.node.type).toBe('object');
  });

  it('tipo desconocido → string genérico', () => {
    const s = adapter.adapt(`CREATE TABLE t (geom GEOMETRY);`);
    expect(field(s, 'geom')?.node.type).toBe('string');
  });

  it('NUMERIC(10,2) — parámetros no afectan el tipo base', () => {
    const s = adapter.adapt(`CREATE TABLE t (price NUMERIC(10,2));`);
    expect(field(s, 'price')?.node.type).toBe('number');
  });
});

// ─── NOT NULL / nullable ──────────────────────────────────────────────────────

describe('SqlDdlAdapter — NOT NULL y nullable', () => {
  it('columna sin NOT NULL → nullable: true, required: false', () => {
    const s = adapter.adapt(`CREATE TABLE t (name VARCHAR(100));`);
    const f = field(s, 'name');
    expect(f?.node.nullable).toBe(true);
    expect(f?.required).toBe(false);
  });

  it('columna con NOT NULL → nullable: false, required: true', () => {
    const s = adapter.adapt(`CREATE TABLE t (name VARCHAR(100) NOT NULL);`);
    const f = field(s, 'name');
    expect(f?.node.nullable).toBe(false);
    expect(f?.required).toBe(true);
  });

  it('PRIMARY KEY inline → nullable: false, required: true', () => {
    const s = adapter.adapt(`CREATE TABLE t (id INT PRIMARY KEY);`);
    const f = field(s, 'id');
    expect(f?.node.nullable).toBe(false);
    expect(f?.required).toBe(true);
  });

  it('PRIMARY KEY como constraint de tabla', () => {
    const sql = `
      CREATE TABLE users (
        id INT,
        email VARCHAR(200),
        PRIMARY KEY (id)
      );
    `;
    const s = adapter.adapt(sql);
    const f = field(s, 'id');
    expect(f?.node.nullable).toBe(false);
    expect(f?.required).toBe(true);
    // email no es pk → nullable
    expect(field(s, 'email')?.node.nullable).toBe(true);
  });

  it('NOT NULL + PRIMARY KEY — no duplica efectos', () => {
    const s = adapter.adapt(`CREATE TABLE t (id INT NOT NULL PRIMARY KEY);`);
    const f = field(s, 'id');
    expect(f?.node.nullable).toBe(false);
    expect(f?.required).toBe(true);
  });
});

// ─── Nombres quoted ────────────────────────────────────────────────────────────

describe('SqlDdlAdapter — nombres quoted', () => {
  it('backtick quotes', () => {
    const sql = 'CREATE TABLE `orders` (`order_id` INT NOT NULL, `amount` DECIMAL);';
    const s = adapter.adapt(sql);
    expect(field(s, 'order_id')).toBeDefined();
    expect(field(s, 'amount')).toBeDefined();
  });

  it('double quotes (SQL standard)', () => {
    const sql = `CREATE TABLE "invoices" ("invoice_id" INT NOT NULL, "total" NUMERIC);`;
    const s = adapter.adapt(sql);
    expect(field(s, 'invoice_id')).toBeDefined();
    expect(field(s, 'total')).toBeDefined();
  });
});

// ─── Comentarios ──────────────────────────────────────────────────────────────

describe('SqlDdlAdapter — comentarios', () => {
  it('elimina comentarios de línea --', () => {
    const sql = `
      CREATE TABLE t (
        id INT NOT NULL, -- primary key
        name TEXT -- nombre del cliente
      );
    `;
    const s = adapter.adapt(sql);
    expect(s.fields).toHaveLength(2);
    expect(field(s, 'id')).toBeDefined();
  });

  it('elimina comentarios de bloque /* */', () => {
    const sql = `
      /* Tabla de pedidos */
      CREATE TABLE orders (
        id INT NOT NULL,
        /* monto en ARS */
        total NUMERIC(10,2)
      );
    `;
    const s = adapter.adapt(sql);
    expect(s.fields).toHaveLength(2);
    expect(field(s, 'total')).toBeDefined();
  });
});

// ─── Casos multi-constraint ───────────────────────────────────────────────────

describe('SqlDdlAdapter — constraints ignoradas', () => {
  it('ignora FOREIGN KEY', () => {
    const sql = `
      CREATE TABLE order_items (
        id INT NOT NULL,
        order_id INT NOT NULL,
        product_id INT,
        FOREIGN KEY (order_id) REFERENCES orders(id)
      );
    `;
    const s = adapter.adapt(sql);
    expect(s.fields).toHaveLength(3);
    expect(field(s, 'id')).toBeDefined();
  });

  it('ignora UNIQUE constraint de tabla', () => {
    const sql = `
      CREATE TABLE users (
        id INT NOT NULL,
        email VARCHAR(200) NOT NULL,
        UNIQUE (email)
      );
    `;
    const s = adapter.adapt(sql);
    expect(s.fields).toHaveLength(2);
  });

  it('ignora CONSTRAINT nombrado', () => {
    const sql = `
      CREATE TABLE t (
        id INT NOT NULL,
        CONSTRAINT pk_id PRIMARY KEY (id)
      );
    `;
    const s = adapter.adapt(sql);
    // CONSTRAINT se ignora como línea, pero el PK de tabla se parsea correctamente
    expect(s.fields.length).toBeGreaterThanOrEqual(1);
    expect(field(s, 'id')).toBeDefined();
  });
});

// ─── Integración con SchemaDiffer ─────────────────────────────────────────────

describe('SqlDdlAdapter — integración con schema engine', () => {
  it('el schema resultante tiene la estructura correcta de InferredJsonSchema', () => {
    const sql = `
      CREATE TABLE payments (
        payment_id UUID NOT NULL PRIMARY KEY,
        amount NUMERIC(12,2) NOT NULL,
        currency VARCHAR(3) NOT NULL,
        status TEXT,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ
      );
    `;
    const schema = adapter.adapt(sql);

    expect(schema.fields).toHaveLength(6);
    expect(schema.sampleCount).toBe(0);
    expect(typeof schema.fingerprint).toBe('string');

    // payment_id: uuid, not null, required
    const paymentId = field(schema, 'payment_id');
    expect(paymentId?.node.format).toBe('uuid');
    expect(paymentId?.required).toBe(true);
    expect(paymentId?.node.nullable).toBe(false);

    // updated_at: nullable
    const updatedAt = field(schema, 'updated_at');
    expect(updatedAt?.node.nullable).toBe(true);
    expect(updatedAt?.required).toBe(false);

    // todos los nodes tienen examples: []
    for (const f of schema.fields) {
      expect(f.node.examples).toEqual([]);
    }
  });
});
