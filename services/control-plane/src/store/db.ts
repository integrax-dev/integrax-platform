import pg from 'pg';

const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

let shuttingDown = false;

async function shutdownPool(): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  try {
    await pool.end();
  } catch {
    // ignore
  }
}

process.once('SIGINT', () => { void shutdownPool(); });
process.once('SIGTERM', () => { void shutdownPool(); });
process.once('beforeExit', () => { void shutdownPool(); });

pool.on('error', (err) => {
  if (shuttingDown) return;
  console.error('Unexpected error on idle client', err);
});
