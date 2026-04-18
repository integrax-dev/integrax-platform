/**
 * PostgresCursorStore
 *
 * Implementación persistente del cursor store para producción.
 * Los cursores sobreviven reinicios — el scheduler retoma exactamente
 * donde quedó antes del crash, sin re-procesar ni saltear cambios.
 *
 * Tabla: polling_cursors (creada automáticamente en primer uso).
 *
 * Uso:
 *   import { Pool } from 'pg';
 *   const store = new PostgresCursorStore(pool);
 *   const scheduler = new PollingScheduler(bus, store);
 */

import type { PollingCursor } from './types.js';

interface PgPool {
  query<R extends Record<string, unknown> = Record<string, unknown>>(
    sql: string, params?: unknown[]
  ): Promise<{ rows: R[] }>;
}

interface CursorRow {
  job_id: string;
  tenant_id: string;
  last_value: string | null;
  last_polled_at: string;
  items_seen: string;
}

export class PostgresCursorStore {
  private ready: Promise<void>;

  constructor(private readonly pool: PgPool) {
    this.ready = this.ensureTable();
  }

  private async ensureTable(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS polling_cursors (
        job_id         TEXT NOT NULL,
        tenant_id      TEXT NOT NULL,
        last_value     TEXT,
        last_polled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        items_seen     BIGINT NOT NULL DEFAULT 0,
        updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (tenant_id, job_id)
      )
    `);
  }

  async get(tenantId: string, jobId: string): Promise<PollingCursor | null> {
    await this.ready;
    const r = await this.pool.query<CursorRow>(
      `SELECT * FROM polling_cursors WHERE tenant_id = $1 AND job_id = $2`,
      [tenantId, jobId],
    );
    if (!r.rows[0]) return null;
    const row = r.rows[0];
    return {
      jobId:        row.job_id,
      tenantId:     row.tenant_id,
      lastValue:    row.last_value,
      lastPolledAt: new Date(row.last_polled_at),
      itemsSeen:    Number(row.items_seen),
    };
  }

  async set(cursor: PollingCursor): Promise<void> {
    await this.ready;
    await this.pool.query(
      `INSERT INTO polling_cursors (job_id, tenant_id, last_value, last_polled_at, items_seen, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (tenant_id, job_id) DO UPDATE SET
         last_value     = EXCLUDED.last_value,
         last_polled_at = EXCLUDED.last_polled_at,
         items_seen     = EXCLUDED.items_seen,
         updated_at     = NOW()`,
      [cursor.jobId, cursor.tenantId, cursor.lastValue?.toString() ?? null,
       cursor.lastPolledAt.toISOString(), cursor.itemsSeen],
    );
  }

  async all(): Promise<PollingCursor[]> {
    await this.ready;
    const r = await this.pool.query<CursorRow>(`SELECT * FROM polling_cursors`);
    return r.rows.map(row => ({
      jobId:        row.job_id,
      tenantId:     row.tenant_id,
      lastValue:    row.last_value,
      lastPolledAt: new Date(row.last_polled_at),
      itemsSeen:    Number(row.items_seen),
    }));
  }
}
