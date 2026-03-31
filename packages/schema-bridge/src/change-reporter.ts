/**
 * Change Reporter
 *
 * Convierte ResolvedConflict[] + FieldMapping[] en un RequirementsReport
 * con requerimientos funcionales categorizados y un resumen ejecutivo.
 * También genera Markdown para usar en issues de GitHub / Notion.
 */

import { ulid } from 'ulid';
import type {
  EffortEstimate,
  FieldDiff,
  FieldMapping,
  FunctionalRequirement,
  LLMEscalation,
  RequirementCategory,
  RequirementPriority,
  RequirementsReport,
  ResolvedConflict,
} from './types.js';

// ─── Clasificación de esfuerzo ────────────────────────────────────────────────

function estimateEffort(mapping: FieldMapping | null): EffortEstimate {
  if (!mapping) return 'high';
  switch (mapping.transform.kind) {
    case 'identity': return 'trivial';
    case 'rename': return 'trivial';
    case 'coerce_type': return 'low';
    case 'restructure': return 'medium';
    case 'constant': return 'trivial';
    case 'split':
    case 'merge': return 'high';
    default: return 'medium';
  }
}

function classifyCategory(diff: FieldDiff): RequirementCategory {
  switch (diff.kind) {
    case 'field_removed': return 'breaking_removal';
    case 'field_added': return 'new_capability';
    case 'type_changed': return 'data_type';
    case 'format_changed': return 'data_type';
    case 'rename_candidate': return 'field_mapping';
    case 'nullability_changed': return 'field_mapping';
    case 'constraint_changed': return 'field_mapping';
    default: return 'schema_restructure';
  }
}

function buildTitle(rc: ResolvedConflict): string {
  const { diff } = rc;
  switch (diff.kind) {
    case 'field_removed':
      return `Eliminar dependencia del campo "${diff.pathA}" (ausente en Sistema B)`;
    case 'field_added':
      return `Nuevo campo "${diff.pathB}" disponible en Sistema B`;
    case 'type_changed':
      return `Cambio de tipo en "${diff.pathA}": ${typeLabel(diff.nodeA)} → ${typeLabel(diff.nodeB)}`;
    case 'format_changed':
      return `Cambio de formato en "${diff.pathA}": ${diff.nodeA?.format ?? 'sin formato'} → ${diff.nodeB?.format ?? 'sin formato'}`;
    case 'rename_candidate':
      return `Renombrado detectado: "${diff.pathA}" → "${diff.pathB}" (${pct(diff.similarity?.combined)}% similitud)`;
    case 'nullability_changed':
      return `Cambio de obligatoriedad en "${diff.pathA}"`;
    case 'constraint_changed':
      return `Cambio de restricciones/enum en "${diff.pathA}"`;
    default:
      return `Diferencia en campo "${diff.pathA ?? diff.pathB}"`;
  }
}

function buildDescription(rc: ResolvedConflict): string {
  const { diff, resolution, mapping, confidence } = rc;
  const parts: string[] = [];

  parts.push(`**Tipo de cambio:** ${kindLabel(diff.kind)}`);
  parts.push(`**Resolución:** ${resolutionLabel(resolution)} (confianza: ${pct(confidence)}%)`);

  if (mapping) {
    parts.push(`**Transformación:** ${mapping.transform.description}`);
    if (mapping.transform.coercionFn) {
      parts.push(`**Función:** \`${mapping.transform.coercionFn}\``);
    }
  }

  if (diff.similarity) {
    parts.push(`**Similitud:** ${pct(diff.similarity.combined)}% (Levenshtein: ${pct(diff.similarity.levenshtein)}%, Jaccard: ${pct(diff.similarity.jaccard)}%, Semántico: ${pct(diff.similarity.semantic)}%)`);
  }

  return parts.join('\n');
}

function typeLabel(node: { type: string | string[]; format?: string } | null): string {
  if (!node) return 'desconocido';
  const t = Array.isArray(node.type) ? node.type.join('|') : node.type;
  return node.format ? `${t}(${node.format})` : t;
}

function kindLabel(kind: string): string {
  const labels: Record<string, string> = {
    field_removed: 'Campo eliminado (BREAKING)',
    field_added: 'Campo nuevo',
    type_changed: 'Cambio de tipo',
    format_changed: 'Cambio de formato',
    rename_candidate: 'Renombrado detectado',
    nullability_changed: 'Cambio de obligatoriedad',
    constraint_changed: 'Cambio de restricciones',
  };
  return labels[kind] ?? kind;
}

function resolutionLabel(r: string): string {
  const labels: Record<string, string> = {
    deterministic: 'Resuelto automáticamente',
    heuristic: 'Resuelto por heurística de dominio',
    ambiguous: 'Requiere intervención manual',
  };
  return labels[r] ?? r;
}

function pct(v?: number): string {
  if (v === undefined || v === null) return '0';
  return (v * 100).toFixed(0);
}

function priorityFromScore(breakingScore: number, resolution: string): RequirementPriority {
  if (resolution === 'ambiguous') return 'P0';
  if (breakingScore >= 0.9) return 'P0';
  if (breakingScore >= 0.5) return 'P1';
  if (breakingScore >= 0.2) return 'P2';
  return 'P3';
}

// ─── ChangeReporter ───────────────────────────────────────────────────────────

export class ChangeReporter {
  buildReport(
    resolvedConflicts: ResolvedConflict[],
    mappings: FieldMapping[],
  ): RequirementsReport {
    const breaking: FunctionalRequirement[] = [];
    const nonBreaking: FunctionalRequirement[] = [];
    const informational: FunctionalRequirement[] = [];
    const llmEscalations: LLMEscalation[] = [];

    let resolvedDeterministically = 0;
    let resolvedByHeuristic = 0;

    for (const rc of resolvedConflicts) {
      if (rc.resolution === 'deterministic') resolvedDeterministically++;
      if (rc.resolution === 'heuristic') resolvedByHeuristic++;

      if (rc.llmRequired && rc.llmReason) {
        llmEscalations.push({
          diff: rc.diff,
          reason: rc.llmReason,
          promptSeed: buildPromptSeed(rc),
        });
      }

      const priority = priorityFromScore(rc.diff.breakingScore, rc.resolution);
      const req: FunctionalRequirement = {
        id: `FR-${ulid().slice(0, 8)}`,
        priority,
        title: buildTitle(rc),
        description: buildDescription(rc),
        affectedFields: [rc.diff.pathA, rc.diff.pathB].filter(Boolean) as string[],
        effortEstimate: estimateEffort(rc.mapping),
        category: classifyCategory(rc.diff),
        autoResolved: rc.mapping !== null,
        generatedTransform: rc.mapping?.transform.coercionFn,
      };

      if (priority === 'P0' || rc.diff.kind === 'field_removed' || rc.diff.breakingScore >= 0.7) {
        breaking.push(req);
      } else if (priority === 'P3' && rc.diff.kind === 'field_added' && rc.resolution === 'deterministic') {
        informational.push(req);
      } else {
        nonBreaking.push(req);
      }
    }

    const totalDiffs = resolvedConflicts.length;
    const resolved = resolvedConflicts.filter(rc => rc.mapping !== null).length;

    return {
      breaking,
      nonBreaking,
      informational,
      llmEscalations,
      summary: {
        totalDiffs,
        breakingCount: breaking.length,
        nonBreakingCount: nonBreaking.length,
        informationalCount: informational.length,
        llmEscalationCount: llmEscalations.length,
        resolvedDeterministically,
        resolvedByHeuristic,
        coveragePercent: totalDiffs > 0 ? Math.round((resolved / totalDiffs) * 100) : 100,
      },
    };
  }

  /**
   * Genera un documento Markdown completo del reporte.
   * Útil para issues de GitHub, Notion, o PRs.
   */
  toMarkdown(report: RequirementsReport, connectorA: string, connectorB: string): string {
    const lines: string[] = [
      `# Requerimientos de integración: ${connectorA} ↔ ${connectorB}`,
      '',
      `**Generado:** ${new Date().toISOString()}`,
      '',
      '## Resumen ejecutivo',
      '',
      `| Métrica | Valor |`,
      `|---------|-------|`,
      `| Total de diferencias | ${report.summary.totalDiffs} |`,
      `| Cambios breaking (P0) | ${report.summary.breakingCount} |`,
      `| Cambios no-breaking | ${report.summary.nonBreakingCount} |`,
      `| Informativos | ${report.summary.informationalCount} |`,
      `| Escalaciones a LLM | ${report.summary.llmEscalationCount} |`,
      `| Resueltos determinísticamente | ${report.summary.resolvedDeterministically} |`,
      `| Resueltos por heurística | ${report.summary.resolvedByHeuristic} |`,
      `| Cobertura automática | ${report.summary.coveragePercent}% |`,
      '',
    ];

    if (report.breaking.length > 0) {
      lines.push('## 🔴 Cambios breaking (P0) — Acción inmediata requerida', '');
      for (const req of report.breaking) {
        lines.push(`### ${req.id}: ${req.title}`, '');
        lines.push(req.description, '');
        lines.push(`- **Categoría:** ${req.category}`);
        lines.push(`- **Esfuerzo:** ${req.effortEstimate}`);
        lines.push(`- **Resuelto automáticamente:** ${req.autoResolved ? 'Sí' : 'No'}`);
        if (req.generatedTransform) lines.push(`- **Transform:** \`${req.generatedTransform}\``);
        lines.push('');
      }
    }

    if (report.nonBreaking.length > 0) {
      lines.push('## 🟡 Cambios no-breaking — Actualizar mappings', '');
      for (const req of report.nonBreaking) {
        lines.push(`### ${req.id}: ${req.title}`, '');
        lines.push(req.description, '');
        lines.push(`- **Prioridad:** ${req.priority} | **Esfuerzo:** ${req.effortEstimate} | **Auto-resuelto:** ${req.autoResolved ? 'Sí' : 'No'}`);
        lines.push('');
      }
    }

    if (report.informational.length > 0) {
      lines.push('## 🟢 Informativos — Sin cambio de código requerido', '');
      for (const req of report.informational) {
        lines.push(`- **${req.id}:** ${req.title}`);
      }
      lines.push('');
    }

    if (report.llmEscalations.length > 0) {
      lines.push('## 🤖 Escalaciones — Requieren análisis adicional', '');
      for (const esc of report.llmEscalations) {
        lines.push(`### Campo: \`${esc.diff.pathA ?? esc.diff.pathB}\``, '');
        lines.push(`**Motivo:** ${esc.reason}`, '');
        lines.push('**Prompt sugerido:**');
        lines.push('```');
        lines.push(esc.promptSeed);
        lines.push('```');
        lines.push('');
      }
    }

    lines.push('---');
    lines.push('*Generado por [@integrax/schema-bridge](https://github.com/integrax) — Motor de comparación determinístico*');

    return lines.join('\n');
  }
}

function buildPromptSeed(rc: ResolvedConflict): string {
  const { diff } = rc;
  return [
    `Analizar diferencia entre Sistema A (campo: "${diff.pathA ?? 'N/A'}") y Sistema B (campo: "${diff.pathB ?? 'N/A'}").`,
    `Tipo en A: ${diff.nodeA ? String(diff.nodeA.type) : 'ausente'}${diff.nodeA?.format ? ` (${diff.nodeA.format})` : ''}.`,
    `Tipo en B: ${diff.nodeB ? String(diff.nodeB.type) : 'ausente'}${diff.nodeB?.format ? ` (${diff.nodeB.format})` : ''}.`,
    `Motivo de escalación: ${rc.llmReason}`,
    `Sugerir: (1) si es renombrado, (2) transformación necesaria, (3) si requiere campo nuevo en el modelo.`,
  ].join(' ');
}

export function createChangeReporter(): ChangeReporter {
  return new ChangeReporter();
}
