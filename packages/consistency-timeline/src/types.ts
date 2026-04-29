/**
 * Admin-safe timeline types.
 *
 * EntityTrace entries carry `deltas: FieldDelta[]` where each delta has
 * `before` and `after` values — raw business data that must never reach
 * admin dashboards. AdminTimelineEntry replaces deltas with a count only.
 *
 * All other trace types are returned as-is since they do not carry payload values.
 */

import type {
  TimelineKind,
  TimelineFilter,
  EntityTrace,
  SyncTrace,
  ConflictTrace,
  WorkflowTrace,
  SchemaDriftTrace,
  PolicyDecisionTrace,
} from '@integrax/timeline';

// ─── Safe EntityTrace variant ─────────────────────────────────────────────────

/** EntityTrace with deltas stripped — only the count is exposed */
export type SafeEntityTrace = Omit<EntityTrace, 'deltas'> & {
  deltaCount: number;
};

/** Union of all safe admin-visible entries */
export type AdminTimelineEntry =
  | SafeEntityTrace
  | SyncTrace
  | ConflictTrace
  | WorkflowTrace
  | SchemaDriftTrace
  | PolicyDecisionTrace;

// ─── Summary ──────────────────────────────────────────────────────────────────

export interface TimelineKindCount {
  kind: TimelineKind;
  count: number;
  latest: Date | null;
}

export interface TimelineSummary {
  tenantId: string;
  from: Date;
  to: Date;
  total: number;
  byKind: TimelineKindCount[];
}

// ─── Filter ───────────────────────────────────────────────────────────────────

export type AdminTimelineFilter = TimelineFilter;
