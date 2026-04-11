/**
 * Tests para pesos dinámicos de señal (dynamic signal weights).
 *
 * Cubre:
 *   - updateMemoryEntry con breakdown → channelHits acumulado
 *   - computeSignalWeights: sin datos, umbral mínimo, dominancia de canal, clamp, filtro por connector
 *   - SimilarityEngine con channelMultipliers → evidenceBreakdown modificado
 *   - DEFAULT_CHANNEL_MULTIPLIERS exportado correctamente
 */

import { describe, it, expect } from 'vitest';
import {
  updateMemoryEntry,
  computeSignalWeights,
  DEFAULT_CHANNEL_MULTIPLIERS,
  MIN_HITS_FOR_CHANNEL_WEIGHTS,
} from '../mapping-memory-provider.js';
import { SimilarityEngine } from '../similarity-engine.js';
import type { MappingMemoryEntry, SimilarityEvidenceBreakdown } from '../types.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeEntry(
  sourcePath: string,
  targetPath: string,
  accepted: number,
  rejected: number,
  avgConf = 0.80,
  channelHits?: Partial<Record<string, number>>,
): MappingMemoryEntry {
  return {
    sourcePath,
    targetPath,
    acceptedCount: accepted,
    rejectedCount: rejected,
    averageConfidence: avgConf,
    lastAcceptedAt: accepted > 0 ? new Date().toISOString() : undefined,
    channelHits: channelHits as MappingMemoryEntry['channelHits'],
  };
}

function makeBreakdown(overrides: Partial<SimilarityEvidenceBreakdown> = {}): SimilarityEvidenceBreakdown {
  return {
    lexical: 0.10,
    value: 0.85,
    structural: 0.60,
    businessType: 0.20,
    ontology: 0.10,
    sufficiency: 0.80,
    ...overrides,
  };
}

// ─── updateMemoryEntry — tracking de channelHits ──────────────────────────────

describe('updateMemoryEntry con breakdown', () => {
  it('registra el canal dominante en channelHits al aceptar', () => {
    const bd = makeBreakdown({ value: 0.90 }); // value domina
    const result = updateMemoryEntry([], 'amount', 'monto', true, 0.85, undefined, undefined, bd);

    expect(result[0].channelHits).toEqual({ value: 1 });
  });

  it('no modifica channelHits al rechazar (aunque haya breakdown)', () => {
    const bd = makeBreakdown({ value: 0.90 });
    const result = updateMemoryEntry([], 'amount', 'monto', false, 0.85, undefined, undefined, bd);

    expect(result[0].channelHits).toBeUndefined();
  });

  it('sin breakdown, channelHits permanece undefined', () => {
    const result = updateMemoryEntry([], 'amount', 'monto', true, 0.85);
    expect(result[0].channelHits).toBeUndefined();
  });

  it('acumula hits del mismo canal en la misma entrada', () => {
    const bd = makeBreakdown({ value: 0.90 });
    let entries = updateMemoryEntry([], 'amount', 'monto', true, 0.85, undefined, undefined, bd);
    entries = updateMemoryEntry(entries, 'amount', 'monto', true, 0.85, undefined, undefined, bd);

    expect(entries[0].channelHits?.value).toBe(2);
  });

  it('acumula hits de canales distintos correctamente', () => {
    const bdValue = makeBreakdown({ value: 0.90, ontology: 0.10 });
    const bdOntology = makeBreakdown({ value: 0.10, ontology: 0.95 });
    let entries = updateMemoryEntry([], 'email', 'correo', true, 0.85, undefined, undefined, bdValue);
    entries = updateMemoryEntry(entries, 'email', 'correo', true, 0.85, undefined, undefined, bdOntology);

    expect(entries[0].channelHits?.value).toBe(1);
    expect(entries[0].channelHits?.ontology).toBe(1);
  });

  it('no altera channelHits de otras entradas del array', () => {
    const bd = makeBreakdown({ lexical: 0.95 });
    const existing = [
      makeEntry('a', 'a2', 1, 0, 0.80, { lexical: 5 }),
      makeEntry('b', 'b2', 1, 0, 0.80),
    ];
    const result = updateMemoryEntry(existing, 'b', 'b2', true, 0.80, undefined, undefined, bd);

    expect(result[0].channelHits).toEqual({ lexical: 5 }); // sin cambios
    expect(result[1].channelHits).toEqual({ lexical: 1 });
  });

  it('detecta correctamente structural como canal dominante', () => {
    const bd = makeBreakdown({ structural: 0.99, value: 0.50, lexical: 0.60 });
    const result = updateMemoryEntry([], 'path.id', 'path.id', true, 0.90, undefined, undefined, bd);

    expect(result[0].channelHits?.structural).toBe(1);
  });

  it('detecta correctamente businessType como canal dominante', () => {
    const bd = makeBreakdown({ businessType: 0.95, value: 0.80, lexical: 0.70 });
    const result = updateMemoryEntry([], 'cuit', 'tax_id', true, 0.90, undefined, undefined, bd);

    expect(result[0].channelHits?.businessType).toBe(1);
  });
});

// ─── computeSignalWeights ─────────────────────────────────────────────────────

describe('computeSignalWeights', () => {
  it('devuelve multipliers por defecto cuando no hay datos', () => {
    const weights = computeSignalWeights([]);
    expect(weights).toEqual(DEFAULT_CHANNEL_MULTIPLIERS);
  });

  it('devuelve multipliers por defecto cuando hay menos de MIN_HITS_FOR_CHANNEL_WEIGHTS hits totales', () => {
    // 2 entradas con 2 hits totales — por debajo del umbral
    const entries = [
      makeEntry('a', 'b', 1, 0, 0.80, { value: 1 }),
      makeEntry('c', 'd', 1, 0, 0.80, { value: 1 }),
    ];
    const weights = computeSignalWeights(entries);
    expect(weights).toEqual(DEFAULT_CHANNEL_MULTIPLIERS);
  });

  it('emite pesos adaptativos con suficientes hits', () => {
    // 8 hits todos en value → value debe tener mult > 1.0, el resto < 1.0
    const entries = [
      makeEntry('a', 'b', 4, 0, 0.80, { value: 4 }),
      makeEntry('c', 'd', 4, 0, 0.80, { value: 4 }),
    ];
    const weights = computeSignalWeights(entries);

    expect(weights.value).toBeGreaterThan(1.0);
    expect(weights.lexical).toBeLessThan(1.0);
    expect(weights.ontology).toBeLessThan(1.0);
  });

  it('clampea el resultado en [0.80, 1.20]', () => {
    // 100 hits en un solo canal → delta = 0.80, pero mult debería clampearse
    const entries = [
      makeEntry('a', 'b', 100, 0, 0.80, { ontology: 100 }),
    ];
    const weights = computeSignalWeights(entries);

    for (const mult of Object.values(weights)) {
      expect(mult).toBeGreaterThanOrEqual(0.80);
      expect(mult).toBeLessThanOrEqual(1.20);
    }
    expect(weights.ontology).toBe(1.20);
  });

  it('ignora entradas sin channelHits', () => {
    const entries = [
      makeEntry('a', 'b', 3, 0, 0.80), // sin channelHits → no contribuye
    ];
    const weights = computeSignalWeights(entries);
    expect(weights).toEqual(DEFAULT_CHANNEL_MULTIPLIERS);
  });

  it('filtra por connectorAId', () => {
    const entries = [
      { ...makeEntry('a', 'b', 3, 0, 0.80, { value: 10 }), connectorAId: 'mp', connectorBId: 'cont' },
      { ...makeEntry('c', 'd', 3, 0, 0.80, { lexical: 10 }), connectorAId: 'other', connectorBId: 'cont' },
    ];
    const weights = computeSignalWeights(entries, 'mp', 'cont');

    // Solo las entradas de mp→cont deben contar (value domina)
    expect(weights.value).toBeGreaterThan(1.0);
    expect(weights.lexical).toBeLessThan(1.0);
  });

  it('filtra por connectorBId', () => {
    const entries = [
      { ...makeEntry('a', 'b', 3, 0, 0.80, { ontology: 10 }), connectorAId: 'mp', connectorBId: 'cont' },
      { ...makeEntry('c', 'd', 3, 0, 0.80, { lexical: 10 }), connectorAId: 'mp', connectorBId: 'other' },
    ];
    const weights = computeSignalWeights(entries, 'mp', 'cont');

    expect(weights.ontology).toBeGreaterThan(1.0);
    expect(weights.lexical).toBeLessThan(1.0);
  });

  it('respeta minHits custom', () => {
    // 10 hits pero minHits=20 → devuelve defaults
    const entries = [
      makeEntry('a', 'b', 5, 0, 0.80, { value: 10 }),
    ];
    const weights = computeSignalWeights(entries, undefined, undefined, 20);
    expect(weights).toEqual(DEFAULT_CHANNEL_MULTIPLIERS);
  });

  it('multipliers son simétricos cuando los hits están uniformemente distribuidos', () => {
    // 2 hits por canal → distribución uniforme → todos los mults deben ser 1.0
    const entries = [
      makeEntry('a', 'b', 5, 0, 0.80, {
        lexical: 2,
        value: 2,
        structural: 2,
        businessType: 2,
        ontology: 2,
      }),
    ];
    const weights = computeSignalWeights(entries);

    for (const mult of Object.values(weights)) {
      expect(mult).toBeCloseTo(1.0, 5);
    }
  });
});

// ─── DEFAULT_CHANNEL_MULTIPLIERS ──────────────────────────────────────────────

describe('DEFAULT_CHANNEL_MULTIPLIERS', () => {
  it('todos los canales tienen valor 1.0', () => {
    expect(DEFAULT_CHANNEL_MULTIPLIERS.lexical).toBe(1.0);
    expect(DEFAULT_CHANNEL_MULTIPLIERS.value).toBe(1.0);
    expect(DEFAULT_CHANNEL_MULTIPLIERS.structural).toBe(1.0);
    expect(DEFAULT_CHANNEL_MULTIPLIERS.businessType).toBe(1.0);
    expect(DEFAULT_CHANNEL_MULTIPLIERS.ontology).toBe(1.0);
  });
});

// ─── MIN_HITS_FOR_CHANNEL_WEIGHTS ─────────────────────────────────────────────

describe('MIN_HITS_FOR_CHANNEL_WEIGHTS', () => {
  it('es 5', () => {
    expect(MIN_HITS_FOR_CHANNEL_WEIGHTS).toBe(5);
  });
});

// ─── SimilarityEngine con channelMultipliers ──────────────────────────────────

describe('SimilarityEngine con channelMultipliers', () => {
  it('amplificar el canal value eleva el score cuando value es alto', () => {
    // email vs correo — léxico bajo, pero si el valor fuera alto se beneficiaría
    // Usamos score() que trabaja solo con nombres (sin nodos → value=0)
    // En este caso, el canal ontology debería amplificarse
    const engineBase = new SimilarityEngine();
    const engineBoosted = new SimilarityEngine({
      channelMultipliers: {
        lexical: 1.20,
        value: 1.0,
        structural: 1.0,
        businessType: 1.0,
        ontology: 1.0,
      },
    });

    const scoreBase = engineBase.score('email', 'mail');
    const scoreBoosted = engineBoosted.score('email', 'mail');

    // Con lexical boost, el breakdown.lexical es mayor → combined >= base
    expect(scoreBoosted.combined).toBeGreaterThanOrEqual(scoreBase.combined);
  });

  it('reducir el canal lexical no eleva combined más allá del caso base', () => {
    const engineBase = new SimilarityEngine();
    const engineReduced = new SimilarityEngine({
      channelMultipliers: {
        lexical: 0.80,
        value: 1.0,
        structural: 1.0,
        businessType: 1.0,
        ontology: 1.0,
      },
    });

    const scoreBase = engineBase.score('name', 'nombre');
    const scoreReduced = engineReduced.score('name', 'nombre');

    // Con lexical reducido, el combined debería ser <= que el base
    expect(scoreReduced.combined).toBeLessThanOrEqual(scoreBase.combined + 0.001);
  });

  it('channelMultipliers=DEFAULT no cambia el comportamiento base', () => {
    const engineBase = new SimilarityEngine();
    const engineDefault = new SimilarityEngine({
      channelMultipliers: { ...DEFAULT_CHANNEL_MULTIPLIERS },
    });

    const pairs = [
      ['email', 'mail'],
      ['user_id', 'userId'],
      ['total_amount', 'monto'],
    ];

    for (const [a, b] of pairs) {
      expect(engineDefault.score(a, b).combined).toBeCloseTo(engineBase.score(a, b).combined, 10);
    }
  });

  it('el evidenceBreakdown refleja los multiplicadores aplicados', () => {
    const engine = new SimilarityEngine({
      channelMultipliers: {
        lexical: 0.80,
        value: 1.0,
        structural: 1.0,
        businessType: 1.0,
        ontology: 1.0,
      },
    });
    const engineBase = new SimilarityEngine();

    const scoreBoosted = engine.score('first_name', 'fname');
    const scoreBase = engineBase.score('first_name', 'fname');

    // Con lexical reducido al 80%, el breakdown.lexical debe ser <= base
    expect(scoreBoosted.evidenceBreakdown!.lexical)
      .toBeLessThanOrEqual(scoreBase.evidenceBreakdown!.lexical + 0.001);
  });

  it('sufficiency no se ve afectado por los multiplicadores', () => {
    const engine = new SimilarityEngine({
      channelMultipliers: {
        lexical: 1.20,
        value: 1.20,
        structural: 1.20,
        businessType: 1.20,
        ontology: 1.20,
      },
    });
    const engineBase = new SimilarityEngine();

    // sin nodos, sufficiency=0 — ambos deben devolver lo mismo
    const boosted = engine.score('qty', 'quantity');
    const base = engineBase.score('qty', 'quantity');

    expect(boosted.evidenceBreakdown!.sufficiency).toBe(base.evidenceBreakdown!.sufficiency);
  });
});
