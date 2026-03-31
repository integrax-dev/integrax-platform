/**
 * Explainability layer para Schema Bridge.
 *
 * Expone dos funciones públicas:
 *   buildExplanation(score)     — construye un MatchExplanation desde un SimilarityScore anotado
 *   formatExplanation(why)      — genera texto legible en español para logs, panel y auditoría
 *
 * Diseño:
 *   - Sin dependencias externas al paquete.
 *   - Determinístico: mismo input → mismo output.
 *   - formatExplanation produce texto plano (sin ANSI, sin HTML) para máxima portabilidad.
 */

import type { MatchExplanation, SimilarityMatchRule, SimilarityScore } from './types.js';

// ─── Labels por regla ─────────────────────────────────────────────────────────

const DECISION_LABEL: Record<SimilarityMatchRule, string> = {
  rule0_memory:  'AUTO-ACCEPT',
  rule1_golden:  'AUTO-ACCEPT',
  rule2_value:   'AUTO-ACCEPT',
  rule3_margin:  'AUTO-ACCEPT',
  rule4_semantic:'AUTO-ACCEPT',
  rule5_review:  'REVISION',
  reject:        'RECHAZADO',
};

const RULE_LABEL: Record<SimilarityMatchRule, string> = {
  rule0_memory:  'Regla 0 — Memoria historica de operadores',
  rule1_golden:  'Regla 1 — Camino dorado (alta confianza, multi-canal)',
  rule2_value:   'Regla 2 — Dominancia de valor (datos observados)',
  rule3_margin:  'Regla 3 — Ganador inequivoco (margen amplio)',
  rule4_semantic:'Regla 4 — Certeza semantica (tipo de negocio / ontologia)',
  rule5_review:  'Regla 5 — Requiere revision humana / LLM',
  reject:        'Rechazado — evidencia insuficiente',
};

// ─── Helpers de formato ───────────────────────────────────────────────────────

function bar(score: number, width = 10): string {
  const filled = Math.round(Math.max(0, Math.min(1, score)) * width);
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

function pct(score: number): string {
  return `${(Math.max(0, Math.min(1, score)) * 100).toFixed(0).padStart(3)}%`;
}

function strength(score: number): string {
  if (score >= 0.90) return 'muy fuerte';
  if (score >= 0.75) return 'fuerte';
  if (score >= 0.55) return 'moderado';
  if (score >= 0.35) return 'debil';
  return 'muy debil';
}

// ─── API pública ──────────────────────────────────────────────────────────────

/**
 * Construye un MatchExplanation desde un SimilarityScore anotado.
 * El score DEBE tener matchRule seteado (via policy.annotate()).
 *
 * nameScore     = canal léxico (evidenceBreakdown.lexical si existe,
 *                 si no: promedio de levenshtein + jaccard + semantic)
 * valueScore    = overlap de valores observados
 * structuralScore = similitud de path / estructura
 * semanticScore = max(businessType, ontology)
 * memoryBased   = true si disparó rule0_memory
 * memoryProvisional = true si la memoria existe pero aún no tiene autoridad
 *                     de auto-accept (score capeado a ≤ 0.82)
 * margin        = min(margin, reciprocalMargin) — lado más débil
 */
export function buildExplanation(score: SimilarityScore): MatchExplanation {
  const b = score.evidenceBreakdown;

  const nameScore = b
    ? b.lexical
    : (score.levenshtein + score.jaccard + score.semantic) / 3;

  const valueScore  = b ? b.value      : score.value;
  const structuralScore = b ? b.structural  : 0;
  const semanticScore   = b ? Math.max(b.businessType, b.ontology) : score.semantic;

  const memoryBased = score.matchRule === 'rule0_memory';

  // Provisional: la memoria contribuyó pero el score estaba capeado a ≤ 0.82
  // porque aún no hay suficientes aceptaciones (< minFeedbackForAutoAccept).
  // Si el score de ontología está en el rango de cap (0.55–0.82 inclusive),
  // asumimos provisional. Si ya superó 0.82, tiene autoridad completa.
  const memoryProvisional: boolean | undefined = memoryBased
    ? (b?.ontology ?? 0) <= 0.82
    : undefined;

  return {
    rule: score.matchRule ?? 'reject',
    nameScore,
    valueScore,
    structuralScore,
    semanticScore,
    memoryBased,
    memoryProvisional,
    margin: Math.min(score.margin ?? 0, score.reciprocalMargin ?? 0),
  };
}

/**
 * Formatea un MatchExplanation como texto plano en español.
 * Apto para logs, respuestas de API, panel de administración y auditoría.
 *
 * Ejemplo de salida:
 *
 *   Decision: AUTO-ACCEPT — Regla 1 — Camino dorado (alta confianza, multi-canal)
 *
 *     Nombre:       91%  █████████░  (muy fuerte)
 *     Valores:      78%  ████████░░  (fuerte)
 *     Estructura:   84%  ████████░░  (fuerte)
 *     Semantico:    90%  █████████░  (muy fuerte)
 *     Margen:       32%  ███░░░░░░░
 *     Memoria:      —   (sin historial para este par)
 */
export function formatExplanation(why: MatchExplanation): string {
  const decision  = DECISION_LABEL[why.rule] ?? 'DESCONOCIDO';
  const ruleLabel = RULE_LABEL[why.rule] ?? why.rule;

  const lines: string[] = [
    `Decision: ${decision} — ${ruleLabel}`,
    '',
    `  Nombre:      ${pct(why.nameScore)}  ${bar(why.nameScore)}  (${strength(why.nameScore)})`,
    `  Valores:     ${pct(why.valueScore)}  ${bar(why.valueScore)}  (${strength(why.valueScore)})`,
    `  Estructura:  ${pct(why.structuralScore)}  ${bar(why.structuralScore)}  (${strength(why.structuralScore)})`,
    `  Semantico:   ${pct(why.semanticScore)}  ${bar(why.semanticScore)}  (${strength(why.semanticScore)})`,
    `  Margen:      ${pct(why.margin)}  ${bar(why.margin)}`,
  ];

  if (why.memoryBased) {
    const memStatus = why.memoryProvisional
      ? 'activa — provisional (< 3 aceptaciones, sin autoridad de auto-accept)'
      : 'activa — con autoridad de auto-accept';
    lines.push(`  Memoria:     ${memStatus}`);
  } else {
    lines.push(`  Memoria:      —   (sin historial para este par)`);
  }

  return lines.join('\n');
}
