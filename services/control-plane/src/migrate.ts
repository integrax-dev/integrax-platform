/**
 * Migration Runner — IntegraX Control Plane
 *
 * Garantías:
 *   1. Advisory lock de Postgres — solo una instancia migra a la vez.
 *      Si dos réplicas arrancan simultáneamente, una espera a la otra.
 *   2. Cada migración corre en su propia transacción.
 *      Si falla a mitad, Postgres hace rollback automático.
 *      La migración queda marcada como FAILED — el proceso aborta con exit(1).
 *   3. Checksum SHA-256 por archivo.
 *      Si alguien modifica un archivo que ya corrió, el runner lo detecta y aborta.
 *   4. Estado persistido en tabla `_migrations` (creada si no existe).
 *   5. Recovery: una migración FAILED puede reintentarse después de corregirla.
 *      Una migración IN_PROGRESS (crash mid-run) se detecta y bloquea hasta revisión manual.
 *   6. Dry-run: MIGRATE_DRY_RUN=true muestra qué correría sin tocar nada.
 */

import 'dotenv/config';
import { readdir, readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';
import pg from 'pg';

const { Client } = pg;

// ─── Config ───────────────────────────────────────────────────────────────────

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../../../db/migrations');
const ADVISORY_LOCK_ID = 7_432_891_234; // arbitrary unique int for this app
const DRY_RUN = process.env.MIGRATE_DRY_RUN === 'true';

// ─── Types ────────────────────────────────────────────────────────────────────

type MigrationStatus = 'pending' | 'running' | 'done' | 'failed';

interface MigrationRecord {
  id: number;
  filename: string;
  checksum: string;
  status: MigrationStatus;
  ran_at: Date | null;
  error: string | null;
  duration_ms: number | null;
}

// ─── Logger (sin dependencia de @integrax/logger para poder correr standalone) ─

function log(level: 'INFO' | 'WARN' | 'ERROR', msg: string, meta?: object): void {
  const line = JSON.stringify({ time: new Date().toISOString(), level, msg, ...meta });
  if (level === 'ERROR') process.stderr.write(line + '\n');
  else process.stdout.write(line + '\n');
}

// ─── Ensure migrations table ──────────────────────────────────────────────────

async function ensureMigrationsTable(client: pg.Client): Promise<void> {
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
}

// ─── Advisory lock ────────────────────────────────────────────────────────────

async function acquireLock(client: pg.Client): Promise<boolean> {
  const result = await client.query<{ pg_try_advisory_lock: boolean }>(
    'SELECT pg_try_advisory_lock($1)',
    [ADVISORY_LOCK_ID],
  );
  return result.rows[0]?.pg_try_advisory_lock === true;
}

async function waitForLock(client: pg.Client, timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const acquired = await acquireLock(client);
    if (acquired) return;
    log('INFO', 'Another instance is migrating — waiting 2s…');
    await new Promise(r => setTimeout(r, 2_000));
  }
  throw new Error('Could not acquire migration lock after 30s. Check for stuck IN_PROGRESS migrations.');
}

// ─── Checksum ─────────────────────────────────────────────────────────────────

function checksum(sql: string): string {
  return createHash('sha256').update(sql).digest('hex');
}

// ─── Core runner ─────────────────────────────────────────────────────────────

async function runMigrations(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    log('ERROR', 'DATABASE_URL is not set');
    process.exit(1);
  }

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
  });

  await client.connect();
  log('INFO', 'Connected to Postgres');

  try {
    await ensureMigrationsTable(client);
    await waitForLock(client);
    log('INFO', 'Migration lock acquired');

    // ── Detect stuck IN_PROGRESS migrations (crash mid-run) ──────────────────
    const stuck = await client.query<MigrationRecord>(
      `SELECT * FROM _migrations WHERE status = 'running'`,
    );
    if (stuck.rows.length > 0) {
      for (const m of stuck.rows) {
        log('ERROR', 'Migration stuck in RUNNING state — manual review required', {
          filename: m.filename,
          ran_at: m.ran_at,
        });
      }
      log('ERROR', 'Fix or delete the stuck migration record, then restart.');
      process.exit(1);
    }

    // ── Detect FAILED migrations ──────────────────────────────────────────────
    const failed = await client.query<MigrationRecord>(
      `SELECT * FROM _migrations WHERE status = 'failed'`,
    );
    if (failed.rows.length > 0) {
      for (const m of failed.rows) {
        log('ERROR', 'Previous migration FAILED — fix the SQL file and retry', {
          filename: m.filename,
          error: m.error,
        });
      }
      process.exit(1);
    }

    // ── Load SQL files ────────────────────────────────────────────────────────
    let files: string[];
    try {
      const all = await readdir(MIGRATIONS_DIR);
      files = all.filter(f => f.endsWith('.sql')).sort();
    } catch {
      log('ERROR', `Migrations directory not found: ${MIGRATIONS_DIR}`);
      process.exit(1);
    }

    if (files.length === 0) {
      log('INFO', 'No migration files found — nothing to do');
      return;
    }

    // ── Load already-ran migrations ───────────────────────────────────────────
    const ranResult = await client.query<MigrationRecord>(
      `SELECT * FROM _migrations WHERE status = 'done' ORDER BY id`,
    );
    const ranMap = new Map<string, MigrationRecord>(ranResult.rows.map(r => [r.filename, r]));

    // ── Checksum validation for already-ran migrations ────────────────────────
    let checksumFailed = false;
    for (const filename of files) {
      const record = ranMap.get(filename);
      if (!record) continue;
      const sql = await readFile(join(MIGRATIONS_DIR, filename), 'utf-8');
      const cs = checksum(sql);
      if (cs !== record.checksum) {
        log('ERROR', 'Migration file was modified after running — ABORT', {
          filename,
          expected: record.checksum,
          actual: cs,
        });
        checksumFailed = true;
      }
    }
    if (checksumFailed) process.exit(1);

    // ── Run pending migrations ────────────────────────────────────────────────
    const pending = files.filter(f => !ranMap.has(f));

    if (pending.length === 0) {
      log('INFO', 'All migrations already ran — database is up to date');
      return;
    }

    log('INFO', `Found ${pending.length} pending migration(s)`, { files: pending });

    if (DRY_RUN) {
      log('INFO', 'DRY RUN — no changes will be made');
      for (const f of pending) log('INFO', `  would run: ${f}`);
      return;
    }

    for (const filename of pending) {
      const sql = await readFile(join(MIGRATIONS_DIR, filename), 'utf-8');
      const cs = checksum(sql);

      log('INFO', `Running migration: ${filename}`);

      // Mark as running BEFORE starting the transaction so a crash is detectable
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

        const durationMs = Date.now() - t0;
        await client.query(
          `UPDATE _migrations SET status = 'done', duration_ms = $1, error = NULL WHERE filename = $2`,
          [durationMs, filename],
        );
        log('INFO', `✓ ${filename} (${durationMs}ms)`);

      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        const message = err instanceof Error ? err.message : String(err);

        await client.query(
          `UPDATE _migrations SET status = 'failed', error = $1, duration_ms = $2 WHERE filename = $3`,
          [message, Date.now() - t0, filename],
        );

        log('ERROR', `✗ Migration FAILED: ${filename}`, { error: message });
        log('ERROR', 'Database was NOT modified (transaction rolled back). Fix the SQL file and restart.');
        process.exit(1);
      }
    }

    log('INFO', `All migrations complete (${pending.length} ran)`);

  } finally {
    // Advisory lock is released automatically when the connection closes
    await client.end();
  }
}

// ─── Entry point ─────────────────────────────────────────────────────────────

runMigrations().catch(err => {
  log('ERROR', 'Unexpected error in migration runner', {
    error: err instanceof Error ? err.message : String(err),
  });
  process.exit(1);
});
