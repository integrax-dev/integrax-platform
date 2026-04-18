/**
 * tenantQuery — wrapper para queries con contexto de tenant (RLS)
 *
 * Usa una transacción explícita para setear app.current_tenant_id antes
 * de la query, de forma que las políticas RLS de Postgres se apliquen.
 *
 * Uso en store functions:
 *   import { tenantQuery } from '../middleware/tenant-context.js';
 *   const rows = await tenantQuery(tenantId, pool,
 *     'SELECT * FROM entity_snapshots WHERE entity_type = $1', ['product']);
 *
 * Para plataforma admin (sin tenantId), usar pool.query directamente —
 * las políticas RLS permiten NULL current_tenant_id (bypass admin).
 */

import type { Pool, QueryResult, QueryResultRow } from 'pg';

export async function tenantQuery<R extends QueryResultRow = QueryResultRow>(
  tenantId: string,
  pool: Pool,
  sql: string,
  params: unknown[] = [],
): Promise<QueryResult<R>> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Parameterized to prevent injection even though tenantId is internal
    await client.query('SELECT set_config($1, $2, true)', ['app.current_tenant_id', tenantId]);
    const result = await client.query<R>(sql, params);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
