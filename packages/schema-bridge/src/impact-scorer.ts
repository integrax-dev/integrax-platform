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
    const hint = buildHint(diff, resolved ?? null, report.connectorAId, report.connectorBId);
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
  connA: string,
  connB: string,
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
        description: `"${diff.pathA}" exists in ${connA} but is absent in ${connB}. Any transform reading this field will produce undefined.`,
        suggestedAction: resolved?.mapping
          ? `Auto-mapped to "${resolved.mapping.pathB}" — review transform in generated TypeScript.`
          : `Add a fallback default or mark this field as optional in the ${connB} schema. Run sync_record to push the updated mapping.`,
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
        description: `"${diff.pathB}" is present in ${connB} but not in ${connA}.`,
        suggestedAction: resolved?.mapping
          ? 'Auto-added with constant default — verify the default value is correct.'
          : `Add this field to the ${connA} schema or set a constant default in the transform.`,
        routeTo: resolved?.resolution === 'deterministic' ? 'auto_resolved' : 'timeline_trace',
        autoTransform,
      };

    case 'type_changed':
      return {
        diffId,
        kind: diff.kind,
        severity: 'error',
        title: `Type changed: ${diff.pathA} (${nodeTypeSummary(diff)} )`,
        description: `Field type diverged between ${connA} and ${connB}. Coercion is required to prevent runtime errors.`,
        suggestedAction: autoTransform
          ? `Auto-coercion: \`${autoTransform}\`. Validate in staging before rolling to production.`
          : `Implement a manual type coercion in the transform function. Consider whether precision loss is acceptable.`,
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
        description: `Fields look similar but have different names. Confidence: ${((diff.similarity?.combined ?? 0) * 100).toFixed(0)}%.`,
        suggestedAction: resolved?.resolution === 'deterministic'
          ? 'High-confidence auto-accept — rename applied in generated transform.'
          : 'Review the mapping in the schema bridge UI and confirm or reject.',
        routeTo: resolved?.resolution === 'deterministic' ? 'auto_resolved' : 'operator_review',
        autoTransform,
      };

    case 'format_changed':
      return {
        diffId,
        kind: diff.kind,
        severity: 'warn',
        title: `Format changed: ${diff.pathA}`,
        description: `The semantic format of "${diff.pathA}" changed (e.g. date → date-time, or plain string → email). Validation rules may need updating.`,
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
        description: `"${diff.pathA}" changed from required to optional (or vice versa). Downstream NOT NULL constraints may fail.`,
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
        description: `Enum values or allowed values changed for "${diff.pathA}".`,
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
