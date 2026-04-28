/**
 * Mapping lifecycle:
 *
 *   candidate → validated → trusted → ground_truth
 *                                   ↓
 *                               deprecated
 *
 * INVARIANT: `ground_truth` can never be reached automatically.
 * The transition `trusted → ground_truth` requires an explicit human
 * approval encoded in the `TransitionEvent` discriminated union below.
 * Any other promotion attempt throws GovernanceViolationError.
 */

export type MappingLifecycleState =
  | 'candidate'    // predicted by the engine, not yet reviewed
  | 'validated'    // reviewed and confirmed by a user
  | 'trusted'      // used in production across multiple tenants / high acceptance
  | 'ground_truth' // canonical — promoted only by explicit human approval
  | 'deprecated';  // no longer used; kept for history

export interface MappingRecord {
  id: string;
  tenantId?: string;       // undefined = platform-level mapping
  connectorAId: string;
  connectorBId: string;
  sourcePath: string;
  targetPath: string;
  entityType?: string;
  state: MappingLifecycleState;
  confidence: number;
  acceptedCount: number;
  rejectedCount: number;
  correctionCount: number;
  /** Who promoted this to ground_truth (required in that state) */
  approvedBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Transition events (discriminated union) ──────────────────────────────────

export type TransitionEvent =
  | { kind: 'validate';      by: string }
  | { kind: 'trust';         by: string }
  | { kind: 'promote_ground_truth'; by: string; approvedBy: string }
  | { kind: 'deprecate';     by: string; reason: string };

export type AllowedTransition =
  | { from: 'candidate';    to: 'validated' }
  | { from: 'validated';    to: 'trusted' }
  | { from: 'trusted';      to: 'ground_truth' }
  | { from: 'trusted';      to: 'deprecated' }
  | { from: 'validated';    to: 'deprecated' }
  | { from: 'candidate';    to: 'deprecated' }
  | { from: 'ground_truth'; to: 'deprecated' };
