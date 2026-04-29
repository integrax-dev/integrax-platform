/**
 * Tenant sync health — platform-scope metadata only.
 *
 * All fields describe structural/operational state.
 * NO field values, entity identifiers, monetary amounts, or business data.
 */

export type ConnectorHealthStatus = 'healthy' | 'degraded' | 'failing' | 'unknown';

export type CriticalityTier = 'critical' | 'high' | 'medium' | 'low';

export interface ConnectorHealthSnapshot {
  connectorId: string;
  status: ConnectorHealthStatus;
  /** ISO timestamp of the last successful sync completion */
  lastSuccessfulSyncAt: Date | null;
  /** ISO timestamp of the last sync attempt (success or failure) */
  lastSyncAttemptAt: Date | null;
  /** Consecutive failure count since last success */
  consecutiveFailures: number;
  /** Approximate lag in milliseconds between last event time and now */
  pipelineLagMs: number | null;
}

export interface TenantSyncHealth {
  tenantId: string;
  /** Snapshot timestamp */
  evaluatedAt: Date;
  /** Per-connector health status */
  connectors: ConnectorHealthSnapshot[];
  /** Score in [0, 1]: ratio of valid/trusted mappings for this tenant */
  mappingValidityScore: number;
  /** Approximate number of records pending reconciliation */
  reconciliationBacklog: number;
  /** True if any connector reported unexpected schema change since last check */
  driftDetectedFlag: boolean;
  /** Active behavior profile id, or null if no profile compiled */
  activeBehaviorProfile: string | null;
  /** Overall criticality tier for alerting/routing */
  criticalityTier: CriticalityTier;
  /** Count of open consistency cases */
  openCaseCount: number;
  /** Count of signals in the last 24 hours */
  signalCount24h: number;
}

// ─── Service ─────────────────────────────────────────────────────────────────

export interface SyncHealthUpdateOptions {
  connectors?: Partial<ConnectorHealthSnapshot>[];
  mappingValidityScore?: number;
  reconciliationBacklog?: number;
  driftDetectedFlag?: boolean;
  activeBehaviorProfile?: string | null;
  openCaseCount?: number;
  signalCount24h?: number;
}
