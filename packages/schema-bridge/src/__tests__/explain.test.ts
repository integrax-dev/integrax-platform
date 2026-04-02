import { describe, it, expect } from 'vitest';
import { buildExplanation, formatExplanation } from '../explain.js';
import type { SimilarityScore, MatchExplanation } from '../types.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeScore(overrides: Partial<SimilarityScore> = {}): SimilarityScore {
  return {
    levenshtein: 0.80,
    jaccard: 0.75,
    semantic: 0.85,
    value: 0.70,
    combined: 0.82,
    margin: 0.25,
    reciprocalMargin: 0.20,
    evidenceBreakdown: {
      lexical: 0.80,
      value: 0.70,
      structural: 0.75,
      businessType: 0.60,
      ontology: 0.65,
      sufficiency: 0.72,
    },
    ...overrides,
  };
}

// ─── buildExplanation ─────────────────────────────────────────────────────────

describe('buildExplanation', () => {
  it('usa evidenceBreakdown.lexical como nameScore cuando está presente', () => {
    const score = makeScore({ matchRule: 'rule1_golden' });
    const why = buildExplanation(score);
    expect(why.nameScore).toBe(0.80); // lexical del breakdown
  });

  it('cae back a promedio de levenshtein+jaccard+semantic si no hay breakdown', () => {
    const score: SimilarityScore = {
      levenshtein: 0.90,
      jaccard: 0.80,
      semantic: 0.70,
      value: 0.60,
      combined: 0.78,
      matchRule: 'rule1_golden',
    };
    const why = buildExplanation(score);
    expect(why.nameScore).toBeCloseTo((0.90 + 0.80 + 0.70) / 3, 5);
  });

  it('semanticScore = max(businessType, ontology)', () => {
    const score = makeScore({
      matchRule: 'rule4_semantic',
      evidenceBreakdown: {
        lexical: 0.5, value: 0.5, structural: 0.7,
        businessType: 0.92, ontology: 0.65, sufficiency: 0.7,
      },
    });
    const why = buildExplanation(score);
    expect(why.semanticScore).toBe(0.92);
  });

  it('margin = min(margin, reciprocalMargin)', () => {
    const score = makeScore({ matchRule: 'rule1_golden', margin: 0.40, reciprocalMargin: 0.20 });
    const why = buildExplanation(score);
    expect(why.margin).toBe(0.20);
  });

  it('memoryBased=true solo para rule0_memory', () => {
    const mem = buildExplanation(makeScore({ matchRule: 'rule0_memory', evidenceBreakdown: { lexical: 0.7, value: 0.6, structural: 0.7, businessType: 0.5, ontology: 0.87, sufficiency: 0.7 } }));
    const golden = buildExplanation(makeScore({ matchRule: 'rule1_golden' }));
    expect(mem.memoryBased).toBe(true);
    expect(golden.memoryBased).toBe(false);
  });

  it('memoryProvisional=true cuando ontology <= 0.82 en rule0_memory', () => {
    const score = makeScore({
      matchRule: 'rule0_memory',
      evidenceBreakdown: { lexical: 0.7, value: 0.6, structural: 0.7, businessType: 0.5, ontology: 0.82, sufficiency: 0.7 },
    });
    expect(buildExplanation(score).memoryProvisional).toBe(true);
  });

  it('memoryProvisional=false cuando ontology > 0.82 en rule0_memory', () => {
    const score = makeScore({
      matchRule: 'rule0_memory',
      evidenceBreakdown: { lexical: 0.7, value: 0.6, structural: 0.7, businessType: 0.5, ontology: 0.90, sufficiency: 0.7 },
    });
    expect(buildExplanation(score).memoryProvisional).toBe(false);
  });

  it('memoryProvisional=undefined cuando no es memoria', () => {
    const why = buildExplanation(makeScore({ matchRule: 'rule2_value' }));
    expect(why.memoryProvisional).toBeUndefined();
  });

  it('rule cae a "reject" si matchRule no está seteado', () => {
    const score = makeScore({ matchRule: undefined });
    expect(buildExplanation(score).rule).toBe('reject');
  });
});

// ─── formatExplanation ────────────────────────────────────────────────────────

describe('formatExplanation', () => {
  const baseWhy: MatchExplanation = {
    rule: 'rule1_golden',
    nameScore: 0.91,
    valueScore: 0.78,
    structuralScore: 0.84,
    semanticScore: 0.90,
    memoryBased: false,
    margin: 0.32,
  };

  it('primera línea incluye decision y label de regla', () => {
    const output = formatExplanation(baseWhy);
    const first = output.split('\n')[0];
    expect(first).toContain('AUTO-ACCEPT');
    expect(first).toContain('Regla 1');
  });

  it('incluye porcentajes de cada canal', () => {
    const output = formatExplanation(baseWhy);
    expect(output).toContain('91%');
    expect(output).toContain('78%');
    expect(output).toContain('84%');
    expect(output).toContain('90%');
    expect(output).toContain('32%');
  });

  it('indica sin historial cuando memoryBased=false', () => {
    const output = formatExplanation(baseWhy);
    expect(output).toContain('sin historial');
  });

  it('indica memoria activa y autoridad completa cuando memoryBased=true y no provisional', () => {
    const why: MatchExplanation = { ...baseWhy, rule: 'rule0_memory', memoryBased: true, memoryProvisional: false };
    const output = formatExplanation(why);
    expect(output).toContain('activa');
    expect(output).toContain('auto-accept');
  });

  it('indica provisional cuando memoryBased=true y provisional=true', () => {
    const why: MatchExplanation = { ...baseWhy, rule: 'rule0_memory', memoryBased: true, memoryProvisional: true };
    const output = formatExplanation(why);
    expect(output).toContain('provisional');
    expect(output).toContain('< 3 aceptaciones');
  });

  it('REVISION para rule5_review', () => {
    const why: MatchExplanation = { ...baseWhy, rule: 'rule5_review' };
    expect(formatExplanation(why).split('\n')[0]).toContain('REVISION');
  });

  it('RECHAZADO para reject', () => {
    const why: MatchExplanation = { ...baseWhy, rule: 'reject' };
    expect(formatExplanation(why).split('\n')[0]).toContain('RECHAZADO');
  });

  it('cubre las 7 reglas sin lanzar excepción', () => {
    const rules = ['rule0_memory', 'rule1_golden', 'rule2_value', 'rule3_margin', 'rule4_semantic', 'rule5_review', 'reject'] as const;
    for (const rule of rules) {
      const why: MatchExplanation = { ...baseWhy, rule, memoryBased: rule === 'rule0_memory' };
      expect(() => formatExplanation(why)).not.toThrow();
    }
  });

  it('las barras tienen siempre exactamente 10 caracteres', () => {
    const output = formatExplanation(baseWhy);
    // Cada barra es una combinación de █ y ░, exactamente 10 chars
    const barMatches = output.match(/[█░]{10}/g);
    expect(barMatches).not.toBeNull();
    expect(barMatches!.length).toBeGreaterThanOrEqual(5); // nombre, valores, estructura, semantico, margen
  });

  it('texto plano — sin caracteres ANSI', () => {
    const output = formatExplanation(baseWhy);
    // eslint-disable-next-line no-control-regex
    expect(output).not.toMatch(/\u001b\[/);
  });
});

// ─── Integración: buildExplanation → formatExplanation ───────────────────────

describe('buildExplanation → formatExplanation (integración)', () => {
  it('pipeline completo no lanza excepción para los 5 casos de auto-accept', () => {
    const rules = ['rule0_memory', 'rule1_golden', 'rule2_value', 'rule3_margin', 'rule4_semantic'] as const;
    for (const matchRule of rules) {
      const score = makeScore({ matchRule });
      const why = buildExplanation(score);
      const text = formatExplanation(why);
      expect(text).toContain('AUTO-ACCEPT');
    }
  });

  it('score sin breakdown produce salida coherente', () => {
    const score: SimilarityScore = {
      levenshtein: 0.70, jaccard: 0.65, semantic: 0.80,
      value: 0.55, combined: 0.68, matchRule: 'rule5_review',
    };
    const text = formatExplanation(buildExplanation(score));
    expect(text).toContain('REVISION');
  });
});
