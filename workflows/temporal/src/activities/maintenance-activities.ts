/**
 * Maintenance Activities
 *
 * Temporal activities for the remediateTenantWorkflow (Safebox pattern).
 *
 * setTenantStatus   — puts a tenant in/out of 'maintenance' mode
 * drainEventBuffer  — replays buffered events via the control-plane webhook endpoint
 *                     so the orchestrator re-processes them once the tenant is healthy
 */

import { Pool } from 'pg';
import { Context } from '@temporalio/activity';

// ─── Postgres pool (lazy, same pattern as order/payment activities) ────────────

let pool: Pool | null = null;

function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString:
        process.env.DATABASE_URL ||
        `postgres://${process.env.POSTGRES_USER ?? 'integrax'}:${process.env.POSTGRES_PASSWORD ?? 'integrax'}@${process.env.POSTGRES_HOST ?? 'localhost'}:${process.env.POSTGRES_PORT ?? '5432'}/${process.env.POSTGRES_DB ?? 'integrax'}`,
    });
  }
  return pool;
}

// ─── Control-plane base URL for internal webhook replay ───────────────────────

function controlPlaneUrl(): string {
  return process.env.CONTROL_PLANE_URL ?? 'http://localhost:3000';
}

// ─── Activities ───────────────────────────────────────────────────────────────

/**
 * Set tenant status (e.g. 'maintenance' | 'active').
 * The orchestrator.ts webhook handler reads this before processing events.
 */
export async function setTenantStatus(tenantId: string, status: string): Promise<void> {
  const db = getPool();
  await db.query(
    'UPDATE tenants SET status = $1, updated_at = NOW() WHERE id = $2',
    [status, tenantId],
  );
  Context.current().log.info(`Tenant ${tenantId} status → ${status}`);
}

/**
 * Drain the drift_event_buffer for a tenant by re-submitting each buffered event
 * to the control-plane webhook endpoint (/webhooks/internal/event).
 * Events are deleted from the buffer only after successful replay.
 *
 * Returns the number of events processed.
 */
export async function drainEventBuffer(tenantId: string): Promise<{ processed: number; failed: number }> {
  const db  = getPool();
  const ctx = Context.current();

  const result = await db.query<{
    id: string;
    source_system: string;
    entity_type: string;
    payload: unknown;
    buffered_at: Date;
  }>(
    'SELECT * FROM drift_event_buffer WHERE tenant_id = $1 ORDER BY buffered_at ASC',
    [tenantId],
  );

  const events = result.rows;
  if (events.length === 0) return { processed: 0, failed: 0 };

  ctx.log.info(`Draining ${events.length} buffered events for tenant ${tenantId}`);

  let processed = 0;
  let failed = 0;
  const baseUrl = controlPlaneUrl();

  for (const event of events) {
    try {
      // Re-submit to the internal event endpoint so the orchestrator processes it
      // exactly as if it had arrived live (idempotency keys prevent duplicates).
      const resp = await fetch(`${baseUrl}/webhooks/internal/event`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Internal-Replay': 'true' },
        body: JSON.stringify({
          tenantId,
          sourceSystem: event.source_system,
          entityType:   event.entity_type,
          payload:      event.payload,
        }),
      });

      if (!resp.ok) {
        ctx.log.warn(`Event ${event.id} replay returned HTTP ${resp.status}`);
        failed++;
        continue;
      }

      // Delete only after successful replay
      await db.query('DELETE FROM drift_event_buffer WHERE id = $1', [event.id]);
      processed++;
    } catch (err) {
      ctx.log.error(`Event ${event.id} replay failed: ${String(err)}`);
      failed++;
    }
  }

  ctx.log.info(`Buffer drain complete: ${processed} processed, ${failed} failed`);
  return { processed, failed };
}
