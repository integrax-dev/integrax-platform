/**
 * Impact Scorer + Remediation Hints
 *
 * Enriches a BridgeReport with:
 *  - impactScore (0–100): how disruptive is this diff set
 *  - impactLabel: 'none' | 'low' | 'medium' | 'high' | 'critical'
 *  - remediationHints: per-diff concrete next steps
 *  - routingHints: which platform layer should act on this diff
 *
 * This is additive — does not modify the engine's internal diff/conflict logic.
 */

import type { BridgeReport, FieldDiff, FunctionalRequirement, ResolvedConflict } from './types.js';

// ─── Types ─────────────────────────────────────────────────────────────────────

export type ImpactLabel = 'none' | 'low' | 'medium' | 'high' | 'critical';

/** Where the platform should route this diff for resolution */
export type RoutingTarget =
  | 'auto_resolved'      // Engine handled it deterministically — no action needed
  | 'operation_engine'   // Trigger a sync/update operation command
  | 'workflow_engine'    // Create or update a workflow step
  | 'operator_review'    // Needs human/LLM review before any action
  | 'incident_alert'     // Breaking change — escalate to team/alert channel
  | 'timeline_trace'     // Low-severity — log to timeline and monitor
  | 'no_action';         // Informational only

export interface RemediationHint {
  diffId: string;           // pathA + pathB + kind
  kind: string;             // mirrors FieldDiff.kind
  severity: 'info' | 'warn' | 'error' | 'critical';
  title: string;
  description: string;
  /** i18n key + params — frontend uses these to render in the active locale */
  descriptionKey: string;
  descriptionParams: Record<string, string>;
  suggestedAction: string;
  routeTo: RoutingTarget;
  /** If the transform was auto-generated, show the coercion expression */
  autoTransform?: string;
  /** If routing to operation_engine, suggested command */
  operationCommand?: string;
}

export interface ImpactAssessment {
  /** 0–100 composite disruptiveness score */
  impactScore: number;
  impactLabel: ImpactLabel;
  /** Per-field remediation hints */
  remediationHints: RemediationHint[];
  /** Top-level routing recommendation for this report */
  primaryRoutingTarget: RoutingTarget;
  /** Summary sentence for display */
  summary: string;
}

// ─── Scoring weights ──────────────────────────────────────────────────────────

const KIND_WEIGHT: Record<string, number> = {
  field_removed:       30,   // Breaking — callers crash if field disappears
  type_changed:        25,   // Breaking — coercions may fail
  field_added:          5,   // Non-breaking — new optional field
  rename_candidate:    15,   // Moderate — mapping updated but may miss data
  format_changed:      15,   // Moderate — serialization/validation breaks
  nullability_changed: 10,   // May break NOT NULL assumptions
  constraint_changed:   5,   // Enum changes rarely break runtime
};

// ─── Main export ──────────────────────────────────────────────────────────────

export function assessImpact(report: BridgeReport): ImpactAssessment {
  const hints: RemediationHint[] = [];

  // Build hint per unresolved or high-severity diff
  for (const diff of report.diffs) {
    const resolved = report.resolvedConflicts.find(
      rc => rc.diff.pathA === diff.pathA && rc.diff.pathB === diff.pathB && rc.diff.kind === diff.kind,
    );
    const hint = buildHint(diff, resolved ?? null);
    hints.push(hint);
  }

  // Add hints for requirements that had no corresponding diff (new capabilities)
  for (const req of report.requirementsReport.breaking) {
    if (!hints.some(h => req.affectedFields.some(f => h.diffId.includes(f)))) {
      hints.push(buildRequirementHint(req, 'breaking'));
    }
  }

  const impactScore = computeScore(report);
  const impactLabel = labelFromScore(impactScore);
  const primaryRoutingTarget = chooseRoutingTarget(report, impactLabel);

  return {
    impactScore,
    impactLabel,
    remediationHints: hints,
    primaryRoutingTarget,
    summary: buildSummary(report, impactLabel, primaryRoutingTarget),
  };
}

// ─── Per-diff hint builder ────────────────────────────────────────────────────

function buildHint(
  diff: FieldDiff,
  resolved: ResolvedConflict | null,
): RemediationHint {
  const diffId = `${diff.pathA ?? '_'}::${diff.pathB ?? '_'}::${diff.kind}`;
  const autoTransform = resolved?.mapping?.transform?.coercionFn ?? undefined;

  switch (diff.kind) {
    case 'field_removed':
      return {
        diffId,
        kind: diff.kind,
        severity: diff.breakingScore >= 0.7 ? 'critical' : 'error',
        title: `Field removed: ${diff.pathA}`,
        description: `The field "${diff.pathA}" was present in the previous version but is no longer available.`,
        descriptionKey: 'incidents.hint.field_removed',
        descriptionParams: { field: diff.pathA ?? '' },
        suggestedAction: resolved?.mapping
          ? `Automatically mapped to "${resolved.mapping.pathB}" — verify the mapping is correct.`
          : `Add a default value for this field, or confirm it is no longer needed and update any integrations that depend on it.`,
        routeTo: resolved?.resolution === 'deterministic' ? 'auto_resolved' : 'operator_review',
        autoTransform,
        operationCommand: 'sync_record',
      };

    case 'field_added':
      return {
        diffId,
        kind: diff.kind,
        severity: 'info',
        title: `New field: ${diff.pathB}`,
        description: `A new field "${diff.pathB}" appeared in the current version.`,
        descriptionKey: 'incidents.hint.field_added',
        descriptionParams: { field: diff.pathB ?? '' },
        suggestedAction: resolved?.mapping
          ? 'Added automatically with a default value — verify the default is correct.'
          : `Include this field in your integration or set a constant default if it is not needed.`,
        routeTo: resolved?.resolution === 'deterministic' ? 'auto_resolved' : 'timeline_trace',
        autoTransform,
      };

    case 'type_changed':
      return {
        diffId,
        kind: diff.kind,
        severity: 'error',
        title: `Type changed: ${diff.pathA} (${nodeTypeSummary(diff)} )`,
        description: `The data type of "${diff.pathA}" changed between versions.`,
        descriptionKey: 'incidents.hint.type_changed',
        descriptionParams: { field: diff.pathA ?? '' },
        suggestedAction: autoTransform
          ? `A conversion was generated automatically. Review it before pushing to production.`
          : `A manual conversion step is needed. Check whether any data precision could be lost.`,
        routeTo: diff.breakingScore >= 0.8 ? 'incident_alert' : 'operator_review',
        autoTransform,
        operationCommand: 'update_record',
      };

    case 'rename_candidate':
      return {
        diffId,
        kind: diff.kind,
        severity: resolved?.resolution === 'deterministic' ? 'info' : 'warn',
        title: `Possible rename: ${diff.pathA} → ${diff.pathB}`,
        description: `"${diff.pathA}" and "${diff.pathB}" may represent the same data with a different name.`,
        descriptionKey: 'incidents.hint.rename_candidate',
        descriptionParams: { a: diff.pathA ?? '', b: diff.pathB ?? '' },
        suggestedAction: resolved?.resolution === 'deterministic'
          ? 'Rename detected with high confidence and applied automatically. Verify the mapping is correct.'
          : 'Confirm or reject this rename in the incident details.',
        routeTo: resolved?.resolution === 'deterministic' ? 'auto_resolved' : 'operator_review',
        autoTransform,
      };

    case 'format_changed':
      return {
        diffId,
        kind: diff.kind,
        severity: 'warn',
        title: `Format changed: ${diff.pathA}`,
        description: `The format of "${diff.pathA}" changed.`,
        descriptionKey: 'incidents.hint.format_changed',
        descriptionParams: { field: diff.pathA ?? '' },
        suggestedAction: 'Update input validation and any format-sensitive transforms.',
        routeTo: 'operator_review',
        autoTransform,
      };

    case 'nullability_changed':
      return {
        diffId,
        kind: diff.kind,
        severity: 'warn',
        title: `Nullability changed: ${diff.pathA}`,
        description: `"${diff.pathA}" changed between required and optional.`,
        descriptionKey: 'incidents.hint.nullability_changed',
        descriptionParams: { field: diff.pathA ?? '' },
        suggestedAction: 'Verify DB constraints and Zod schemas that assume non-null for this field.',
        routeTo: 'timeline_trace',
        autoTransform,
      };

    case 'constraint_changed':
      return {
        diffId,
        kind: diff.kind,
        severity: 'info',
        title: `Constraint changed: ${diff.pathA}`,
        description: `The allowed values for "${diff.pathA}" changed.`,
        descriptionKey: 'incidents.hint.constraint_changed',
        descriptionParams: { field: diff.pathA ?? '' },
        suggestedAction: 'Update allowed value lists in validation schemas and operation payloads.',
        routeTo: 'timeline_trace',
        autoTransform,
      };

    default:
      return {
        diffId,
        kind: diff.kind,
        severity: 'info',
        title: `Schema change: ${diff.pathA ?? diff.pathB}`,
        description: 'A schema change was detected.',
        descriptionKey: 'incidents.hint.default',
        descriptionParams: { field: diff.pathA ?? diff.pathB ?? '' },
        suggestedAction: 'Review the diff manually.',
        routeTo: 'timeline_trace',
      };
  }
}

function buildRequirementHint(req: FunctionalRequirement, level: 'breaking' | 'nonBreaking'): RemediationHint {
  return {
    diffId: `req::${req.id}`,
    kind: req.category,
    severity: level === 'breaking' ? 'critical' : 'warn',
    title: req.title,
    description: req.description,
    descriptionKey: 'incidents.hint.default',
    descriptionParams: { field: req.title },
    suggestedAction: req.generatedTransform
      ? `Generated transform available: \`${req.generatedTransform}\``
      : 'Manual implementation required.',
    routeTo: level === 'breaking' ? 'incident_alert' : 'operator_review',
    autoTransform: req.generatedTransform,
    operationCommand: req.category === 'field_mapping' ? 'sync_record' : undefined,
  };
}

// ─── Score computation ────────────────────────────────────────────────────────

function computeScore(report: BridgeReport): number {
  const { summary } = report.requirementsReport;
  if (summary.totalDiffs === 0) return 0;

  let raw = 0;
  for (const diff of report.diffs) {
    raw += KIND_WEIGHT[diff.kind] ?? 5;
    raw += diff.breakingScore * 10;  // bonus for high breaking score
  }

  // LLM escalations indicate high ambiguity
  raw += summary.llmEscalationCount * 20;

  // Drift penalty
  if (report.driftDetected) raw += 15;

  // Normalize to 0–100
  const maxPossible = report.diffs.length * (30 + 10) + summary.llmEscalationCount * 20 + 15;
  return Math.min(100, Math.round((raw / Math.max(maxPossible, 1)) * 100));
}

function labelFromScore(score: number): ImpactLabel {
  if (score === 0) return 'none';
  if (score <= 20) return 'low';
  if (score <= 50) return 'medium';
  if (score <= 75) return 'high';
  return 'critical';
}

function chooseRoutingTarget(report: BridgeReport, label: ImpactLabel): RoutingTarget {
  if (label === 'critical') return 'incident_alert';
  if (label === 'high') return 'operator_review';
  if (report.requirementsReport.summary.breakingCount > 0) return 'operator_review';
  if (label === 'medium') return 'workflow_engine';
  if (label === 'low') return 'timeline_trace';
  return 'no_action';
}

function buildSummary(report: BridgeReport, label: ImpactLabel, routing: RoutingTarget): string {
  const { summary } = report.requirementsReport;
  const parts: string[] = [];

  if (summary.breakingCount > 0) parts.push(`${summary.breakingCount} breaking change${summary.breakingCount > 1 ? 's' : ''}`);
  if (summary.nonBreakingCount > 0) parts.push(`${summary.nonBreakingCount} non-breaking`);
  if (summary.llmEscalationCount > 0) parts.push(`${summary.llmEscalationCount} need manual review`);

  const changesSummary = parts.length > 0 ? parts.join(', ') : 'no changes';
  return `[${label.toUpperCase()}] ${report.connectorAId} ↔ ${report.connectorBId}: ${changesSummary}. Recommended action: ${routing.replace(/_/g, ' ')}.`;
}

function nodeTypeSummary(diff: FieldDiff): string {
  const a = diff.nodeA ? String(diff.nodeA.type) : '?';
  const b = diff.nodeB ? String(diff.nodeB.type) : '?';
  return `${a} → ${b}`;
}
