/**
 * Integration Orchestrator — Core Types
 *
 * These types define the contract between the orchestrator and its
 * dependencies. Nothing here imports concrete implementations; the
 * orchestrator is wired by the composition root (control-plane container).
 */

import type { ConnectorManifest, ConnectorFacade } from '@integrax/connector-sdk';
import type { SnapshotStore } from '@integrax/snapshot-store';
import type { EventBus } from '@integrax/event-bus';
import type { TimelineStore } from '@integrax/timeline';
import type { PollingScheduler } from '@integrax/polling-scheduler';

// ─── Registration ─────────────────────────────────────────────────────────────

/**
 * A connector registered with the orchestrator.
 * The facade is created on-demand per (tenant, credentials) pair.
 */
export interface ConnectorRegistration {
  connectorId: string;
  manifest: ConnectorManifest;
  /**
   * Factory that produces a ConnectorFacade bound to specific credentials.
   * Called once per tenant context; the result MAY be cached by the caller.
   */
  createFacade: (
    credentials: Record<string, string>,
    tenantId: string,
  ) => ConnectorFacade;
}

// ─── Configuration ────────────────────────────────────────────────────────────

export interface OrchestratorConfig {
  snapshotStore: SnapshotStore;
  eventBus: EventBus;
  timelineStore: TimelineStore;
  /** Optional: if provided, the orchestrator can register polling jobs. */
  scheduler?: PollingScheduler;
  /**
   * Optional factory for creating per-tenant IdentityResolvers.
   * Defaults to `() => new IdentityResolver()`.
   * Inject a persistent resolver to load/save aliases from a DB store.
   */
  resolverFactory?: (tenantId: string) => import('@integrax/platform-kernel').IdentityResolver;
}

// ─── Results ──────────────────────────────────────────────────────────────────

export interface OrchestratorResult {
  connectorId: string;
  entityType: string;
  tenantId: string;
  itemsProcessed: number;
  snapshotsUpdated: number;
  eventsEmitted: number;
  errors: string[];
}

// ─── Canonical intermediate ───────────────────────────────────────────────────

/**
 * An entity after field-mapping but before persistence.
 * Not typed as a specific entity (Order/Invoice/etc.) because the
 * manifest mapping is generic — callers may cast as needed.
 */
export interface CanonicalizedEntity {
  /** ULID assigned by IdentityResolver (stable across systems). */
  canonicalId: string;
  /** All known external references for this entity. */
  externalIds: Array<{ system: string; id: string }>;
  entityType: string;
  sourceSystem: string;
  /** Field-mapped payload, ready for snapshot-store. */
  payload: Record<string, unknown>;
  /** Best-effort source timestamp; defaults to now if unavailable. */
  updatedAt: Date;
}
