import { pool } from './db.js';

export interface CreditTransaction {
  id: string;
  tenantId: string;
  delta: number;
  balanceAfter: number;
  reason: string;
  refId?: string;
  createdAt: Date;
}

export async function getBalance(tenantId: string): Promise<number> {
  const r = await pool.query<{ balance: string }>(
    `SELECT balance FROM api_credit_balances WHERE tenant_id = $1`,
    [tenantId],
  );
  return r.rows[0] ? parseInt(r.rows[0].balance, 10) : 0;
}

export async function addCredits(
  tenantId: string,
  amount: number,
  reason: string,
  refId?: string,
): Promise<{ balance: number }> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Upsert balance
    await client.query(
      `INSERT INTO api_credit_balances (tenant_id, balance, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (tenant_id) DO UPDATE SET
         balance = api_credit_balances.balance + $2,
         updated_at = NOW()`,
      [tenantId, amount],
    );

    const balanceRow = await client.query<{ balance: string }>(
      `SELECT balance FROM api_credit_balances WHERE tenant_id = $1`,
      [tenantId],
    );
    const balanceAfter = parseInt(balanceRow.rows[0].balance, 10);

    await client.query(
      `INSERT INTO api_credits (id, tenant_id, delta, balance_after, reason, ref_id, created_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, NOW())`,
      [tenantId, amount, balanceAfter, reason, refId ?? null],
    );

    await client.query('COMMIT');
    return { balance: balanceAfter };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/** Deduct credits. Returns false if insufficient balance. */
export async function consumeCredits(
  tenantId: string,
  amount: number,
  reason: string,
  refId?: string,
): Promise<{ ok: boolean; balance: number }> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const lockRow = await client.query<{ balance: string }>(
      `SELECT balance FROM api_credit_balances WHERE tenant_id = $1 FOR UPDATE`,
      [tenantId],
    );

    const current = lockRow.rows[0] ? parseInt(lockRow.rows[0].balance, 10) : 0;
    if (current < amount) {
      await client.query('ROLLBACK');
      return { ok: false, balance: current };
    }

    const balanceAfter = current - amount;
    await client.query(
      `UPDATE api_credit_balances SET balance = $1, updated_at = NOW() WHERE tenant_id = $2`,
      [balanceAfter, tenantId],
    );

    await client.query(
      `INSERT INTO api_credits (id, tenant_id, delta, balance_after, reason, ref_id, created_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, NOW())`,
      [tenantId, -amount, balanceAfter, reason, refId ?? null],
    );

    await client.query('COMMIT');
    return { ok: true, balance: balanceAfter };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function getCreditHistory(
  tenantId: string,
  limit = 50,
  offset = 0,
): Promise<CreditTransaction[]> {
  const r = await pool.query<{
    id: string; tenant_id: string; delta: string; balance_after: string;
    reason: string; ref_id: string | null; created_at: Date;
  }>(
    `SELECT * FROM api_credits WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
    [tenantId, limit, offset],
  );
  return r.rows.map(row => ({
    id: row.id,
    tenantId: row.tenant_id,
    delta: parseInt(row.delta, 10),
    balanceAfter: parseInt(row.balance_after, 10),
    reason: row.reason,
    refId: row.ref_id ?? undefined,
    createdAt: row.created_at,
  }));
}
