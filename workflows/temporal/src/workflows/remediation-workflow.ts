/**
 * Remediation Workflow — Safebox Pattern
 *
 * Safe, zero-data-loss infrastructure update for a single tenant:
 *
 *   1. Enter maintenance   → orchestrator starts buffering inbound events
 *   2. Apply remediation   → caller supplies the actual fix steps via signals
 *                            or we wait a configurable grace window
 *   3. Drain buffer        → replay all events that arrived during maintenance
 *   4. Return to active    → tenant is live again
 *
 * On failure the tenant stays in 'maintenance' for human review (safe default).
 */

import { proxyActivities, defineSignal, setHandler, sleep, condition } from '@temporalio/workflow';
import type * as maintenanceActivities from '../activities/maintenance-activities.js';

// ─── Activity proxies ─────────────────────────────────────────────────────────

const { setTenantStatus, drainEventBuffer } = proxyActivities<typeof maintenanceActivities>({
  startToCloseTimeout: '2 minutes',
  retry: {
    initialInterval: '10s',
    maximumAttempts: 5,
    backoffCoefficient: 2,
  },
});

// ─── Signals ──────────────────────────────────────────────────────────────────

/** Signal to notify the workflow that the remediation step finished externally. */
export const remediationCompleteSignal = defineSignal<[{ success: boolean; details?: string }]>(
  'remediationComplete',
);

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RemediationWorkflowInput {
  tenantId: string;
  /** Max time to wait for a remediationComplete signal before timing out (default: 10 min). */
  remediationTimeoutMs?: number;
  /** If true, skip the signal wait and just open/close the maintenance window (e.g. for auto-fixes). */
  autoComplete?: boolean;
  /** Grace window when autoComplete=true (default: 5 s). */
  autoCompleteDelayMs?: number;
}

export interface RemediationWorkflowOutput {
  success: boolean;
  tenantId: string;
  bufferedEventsProcessed: number;
  bufferedEventsFailed: number;
  details?: string;
}

// ─── Workflow ─────────────────────────────────────────────────────────────────

export async function remediateTenantWorkflow(
  input: RemediationWorkflowInput,
): Promise<RemediationWorkflowOutput> {
  const {
    tenantId,
    remediationTimeoutMs  = 10 * 60 * 1000,  // 10 min
    autoComplete          = false,
    autoCompleteDelayMs   = 5_000,
  } = input;

  // ── 1. Enter maintenance ───────────────────────────────────────────────────
  await setTenantStatus(tenantId, 'maintenance');

  let remediationMsg = '';

  try {
    // ── 2. Wait for remediation to complete ───────────────────────────────────
    if (autoComplete) {
      // Automatic path: just hold the window open for the grace delay
      await sleep(autoCompleteDelayMs);
      // remediation complete
    } else {
      // Manual / external path: wait for a signal
      let signalReceived = false;
      let signalSuccess  = false;

      setHandler(remediationCompleteSignal, ({ success, details }) => {
        signalReceived = true;
        signalSuccess  = success;
        remediationMsg = details ?? '';
      });

      const completed = await condition(() => signalReceived, remediationTimeoutMs);

      if (!completed) {
        // Timeout — stay in maintenance for safety
        throw new Error(`Remediation timeout after ${remediationTimeoutMs}ms — tenant left in maintenance`);
      }

      if (!signalSuccess) {
        throw new Error(`Remediation signalled as failed: ${remediationMsg}`);
      }

      // remediation complete
    }

    // ── 3. Drain buffered events ──────────────────────────────────────────────
    const drain = await drainEventBuffer(tenantId);

    // ── 4. Return to active ───────────────────────────────────────────────────
    await setTenantStatus(tenantId, 'active');

    return {
      success: true,
      tenantId,
      bufferedEventsProcessed: drain.processed,
      bufferedEventsFailed:    drain.failed,
      details: remediationMsg || undefined,
    };
  } catch (err) {
    // Tenant stays in 'maintenance' — do NOT auto-revert on failure.
    // A human must verify and manually call setTenantStatus('active').
    const msg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      tenantId,
      bufferedEventsProcessed: 0,
      bufferedEventsFailed:    0,
      details: msg,
    };
  }
}
