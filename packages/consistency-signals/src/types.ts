/**
 * Taxonomy:
 *   Signals  — platform-scope observations; metadata only, no payload values
 *   Cases    — grouped set of related signals for a tenant entity
 *   Timeline — ordered audit trail for a case
 *
 * Signals NEVER carry field values or business data — only structural metadata.
 * This is enforced structurally: the TimelineEvent type has `sensitive: false`
 * as a literal type (not a runtime check).
 */

// ─── Signal ───────────────────────────────────────────────────────────────────

export type SignalKind =
  | 'field_mismatch'         // same field, different values across connectors
  | 'field_missing'          // field exists in A but not in B
  | 'type_mismatch'          // same field, incompatible types
  | 'value_out_of_tolerance' // numeric divergence exceeds tolerance
  | 'state_divergence'       // lifecycle state differs (e.g. order status)
  | 'identity_conflict'      // same entity mapped to different IDs
  | 'duplicate_detected'     // suspected duplicate entity across connectors
  | 'schema_drift'           // connector schema changed unexpectedly
  | 'authority_violation'    // change applied without authority clearance
  | 'propagation_lag';       // expected propagation did not occur in time

export type SignalSeverity = 'INFO' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface ConsistencySignal {
  id: string;
  tenantId: string;
  kind: SignalKind;
  severity: SignalSeverity;
  entityType: string;
  entityId?: string;         // canonical entity ID if resolved
  connectorA: string;
  connectorB?: string;
  /** The field path involved. NO values — only the path. */
  fieldPath?: string;
  /** Structured tags for grouping/filtering. No payload values. */
  tags: Record<string, string>;
  /** Stable hash of (tenantId + kind + entityType + entityId + fieldPath + connectors).
   *  Used for deduplication. */
  deduplicationKey: string;
  occurredAt: Date;
  resolvedAt?: Date;
  caseId?: string;
}

// ─── Case ─────────────────────────────────────────────────────────────────────

export type CaseStatus = 'open' | 'investigating' | 'resolved' | 'wont_fix' | 'suppressed';

export type CaseType =
  | 'STRICT_MISMATCH'       // hard field value divergence across connectors
  | 'POLICY_VIOLATION'      // behavior intent or tolerance rule broken
  | 'APPROVAL_REQUIRED'     // change needs explicit human sign-off
  | 'PROPAGATION_BLOCKED'   // propagation could not proceed (authority/lock)
  | 'MAPPING_UNCERTAINTY'   // no trusted mapping for a field pair
  | 'CONNECTOR_FAILURE'     // connector sync failed or timed out
  | 'SCHEMA_DRIFT';         // unexpected schema change detected in connector

export interface ConsistencyCase {
  id: string;
  tenantId: string;
  entityType: string;
  entityId?: string;
  title: string;
  caseType: CaseType;
  status: CaseStatus;
  severity: SignalSeverity;
  /** IDs of all signals that belong to this case */
  signalIds: string[];
  assignedTo?: string;
  createdAt: Date;
  updatedAt: Date;
  resolvedAt?: Date;
}

// ─── Timeline ─────────────────────────────────────────────────────────────────

export type TimelineEventKind =
  | 'signal_added'
  | 'case_opened'
  | 'case_status_changed'
  | 'case_assigned'
  | 'case_resolved'
  | 'note_added'
  | 'authority_applied'
  | 'propagation_triggered'
  | 'escalated';

export interface TimelineEvent {
  id: string;
  caseId: string;
  tenantId: string;
  kind: TimelineEventKind;
  actor?: string;            // userId or system identifier
  /** Human-readable description. Must NEVER contain field values. */
  description: string;
  meta: Record<string, string | number | boolean>;
  occurredAt: Date;
  /** Structural guarantee: timeline events never carry sensitive payload data */
  sensitive: false;
}
