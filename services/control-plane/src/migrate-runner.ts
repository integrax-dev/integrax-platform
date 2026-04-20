/**
 * migrate-runner — versión embebida para startup del server
 *
 * Usa el pool existente (no abre una conexión separada).
 * Mismas garantías que migrate.ts standalone:
 *   - Advisory lock de Postgres (una sola instancia migra)
 *   - Cada migración en su propia transacción (rollback si falla)
 *   - Checksum SHA-256 por archivo (detecta modificaciones post-run)
 *   - Recovery de migraciones IN_PROGRESS (crash detectado, proceso aborta)
 */

import { readdir, readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';
import type { Pool } from 'pg';

interface Logger {
  info(meta: object | string, msg?: string): void;
  warn(meta: object | string, msg?: string): void;
  error(meta: object | string, msg?: string): void;
}

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../../db/migrations');
const ADVISORY_LOCK_ID = 7_432_891_234;

type MigStatus = 'running' | 'done' | 'failed';

interface MigRow {
  filename: string;
  checksum: string;
  status: MigStatus;
  ran_at: Date | null;
  error: string | null;
}

function sha256(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}

export async function runMigrations(pool: Pool, log: Logger): Promise<void> {
  const client = await pool.connect();

  try {
    // ── Ensure table ────────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id           SERIAL PRIMARY KEY,
        filename     TEXT        NOT NULL UNIQUE,
        checksum     TEXT        NOT NULL,
        status       TEXT        NOT NULL DEFAULT 'pending',
        ran_at       TIMESTAMPTZ,
        error        TEXT,
        duration_ms  INTEGER
      );
      CREATE INDEX IF NOT EXISTS _migrations_status ON _migrations(status);
    `);

    // ── Advisory lock — wait up to 30s ──────────────────────────────────────
    const deadline = Date.now() + 30_000;
    let locked = false;
    while (Date.now() < deadline) {
      const r = await client.query<{ pg_try_advisory_lock: boolean }>(
        'SELECT pg_try_advisory_lock($1)', [ADVISORY_LOCK_ID],
      );
      if (r.rows[0]?.pg_try_advisory_lock) { locked = true; break; }
      log.info('Migration lock held by another instance — waiting 2s…');
      await new Promise(r => setTimeout(r, 2_000));
    }
    if (!locked) throw new Error('Could not acquire migration lock after 30s');

    // ── Stuck IN_PROGRESS detection ─────────────────────────────────────────
    const stuck = await client.query<MigRow>(`SELECT * FROM _migrations WHERE status = 'running'`);
    if (stuck.rows.length > 0) {
      for (const m of stuck.rows) {
        log.error({ filename: m.filename, ran_at: m.ran_at },
          'Migration stuck in RUNNING state — manual review required');
      }
      throw new Error('Stuck migration detected. Fix or delete the record, then restart.');
    }

    // ── Failed detection ────────────────────────────────────────────────────
    const failed = await client.query<MigRow>(`SELECT * FROM _migrations WHERE status = 'failed'`);
    if (failed.rows.length > 0) {
      for (const m of failed.rows) {
        log.error({ filename: m.filename, error: m.error },
          'Previous migration FAILED — fix the SQL file and retry');
      }
      throw new Error('Failed migration detected. Fix the SQL and restart.');
    }

    // ── Load files ──────────────────────────────────────────────────────────
    let files: string[] = [];
    try {
      const all = await readdir(MIGRATIONS_DIR);
      files = all.filter(f => f.endsWith('.sql')).sort();
    } catch {
      log.warn({ dir: MIGRATIONS_DIR }, 'Migrations directory not found — skipping');
      return;
    }

    if (files.length === 0) { log.info('No migration files found'); return; }

    // ── Load ran migrations ─────────────────────────────────────────────────
    const ranResult = await client.query<MigRow>(
      `SELECT * FROM _migrations WHERE status = 'done'`,
    );
    const ran = new Map<string, MigRow>(ranResult.rows.map(r => [r.filename, r]));

    // ── Checksum validation ─────────────────────────────────────────────────
    for (const filename of files) {
      const record = ran.get(filename);
      if (!record) continue;
      const sql = await readFile(join(MIGRATIONS_DIR, filename), 'utf-8');
      if (sha256(sql) !== record.checksum) {
        throw new Error(
          `Migration file was modified after running: ${filename}. ` +
          `This is dangerous — never edit a migration that already ran. ` +
          `Create a new migration to fix it.`,
        );
      }
    }

    // ── Run pending ─────────────────────────────────────────────────────────
    const pending = files.filter(f => !ran.has(f));

    if (pending.length === 0) {
      log.info('Database is up to date — no migrations to run');
      return;
    }

    log.info({ count: pending.length, files: pending }, 'Running migrations');

    for (const filename of pending) {
      const sql = await readFile(join(MIGRATIONS_DIR, filename), 'utf-8');
      const cs = sha256(sql);

      // Mark RUNNING before transaction — crash is detectable
      await client.query(
        `INSERT INTO _migrations (filename, checksum, status, ran_at)
         VALUES ($1, $2, 'running', NOW())
         ON CONFLICT (filename) DO UPDATE SET status = 'running', ran_at = NOW(), error = NULL`,
        [filename, cs],
      );

      const t0 = Date.now();
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('COMMIT');

        const ms = Date.now() - t0;
        await client.query(
          `UPDATE _migrations SET status = 'done', duration_ms = $1, error = NULL WHERE filename = $2`,
          [ms, filename],
        );
        log.info({ filename, ms }, '✓ migration done');

      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        const message = err instanceof Error ? err.message : String(err);
        await client.query(
          `UPDATE _migrations SET status = 'failed', error = $1, duration_ms = $2 WHERE filename = $3`,
          [message, Date.now() - t0, filename],
        );
        throw new Error(`Migration failed: ${filename}\n${message}`);
      }
    }

    log.info({ count: pending.length }, 'All migrations complete');

  } finally {
    // Advisory lock auto-released when client returns to pool
    client.release();
  }
}
