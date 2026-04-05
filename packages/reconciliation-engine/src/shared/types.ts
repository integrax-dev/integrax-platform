/**
 * Shared primitives for the reconciliation engine.
 * No connector-specific concepts here.
 */

// ─── Severity ─────────────────────────────────────────────────────────────────

export type Severity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

const SEVERITY_RANK: Record<Severity, number> = { LOW: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3 };

export function severityFromScore(score: number): Severity {
  if (score >= 0.9) return 'CRITICAL';
  if (score >= 0.6) return 'HIGH';
  if (score >= 0.3) return 'MEDIUM';
  return 'LOW';
}

export function maxSeverity(a: Severity, b: Severity): Severity {
  return SEVERITY_RANK[a] >= SEVERITY_RANK[b] ? a : b;
}

// ─── Policy action ────────────────────────────────────────────────────────────

export type PolicyAction = 'BLOCK' | 'ALERT' | 'AUTO_FIX' | 'IGNORE';

const ACTION_RANK: Record<PolicyAction | 'PROCEED', number> = {
  PROCEED: 0, IGNORE: 0, AUTO_FIX: 1, ALERT: 2, BLOCK: 3,
};

/** Returns the most severe action across a list, or 'PROCEED' if empty. */
export function aggregateAction(actions: PolicyAction[]): PolicyAction | 'PROCEED' {
  if (actions.length === 0) return 'PROCEED';
  return actions.reduce<PolicyAction | 'PROCEED'>(
    (max, a) => ACTION_RANK[a] > ACTION_RANK[max] ? a : max,
    'PROCEED',
  );
}

// ─── Match decision ───────────────────────────────────────────────────────────

export type MatchDecision = 'match' | 'review' | 'no_match';

export interface MatchResult {
  decision: MatchDecision;
  confidence: number;  // 0.0–1.0
  reason: string;
}

// ─── Diff & conflicts ─────────────────────────────────────────────────────────

export interface FieldDiff {
  field: string;
  valueA: unknown;
  valueB: unknown;
  systemA: string;
  systemB: string;
}

export interface EntityConflict<TType extends string = string> {
  type: TType;
  severity: Severity;
  systems: [string, string];
  entityType: string;
  diffs: FieldDiff[];
  summary: string;
  detectedAt: Date;
}

export interface PolicyEvaluationResult<TType extends string = string> {
  conflict: EntityConflict<TType>;
  action: PolicyAction;
  reason: string;
}

export interface ReconciliationResult<TType extends string = string> {
  match: MatchResult;
  conflicts: PolicyEvaluationResult<TType>[];
  recommendation: PolicyAction | 'PROCEED';
}
