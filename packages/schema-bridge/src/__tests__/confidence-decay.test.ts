/**
 * Tests para confidence decay en computeSignalWeights.
 *
 * Cubre:
 *   - computeDecayFactor: sin timestamp, futuro, hoy, antigüedad exacta
 *   - computeSignalWeights con decay: entradas viejas pesan menos
 *   - Entries con lastAcceptedAt=undefined preservan peso 1.0
 */

import { describe, it, expect } from 'vitest';
import {
  computeDecayFactor,
  computeSignalWeights,
  DEFAULT_CHANNEL_MULTIPLIERS,
  DECAY_HALF_LIFE_DAYS,
} from '../mapping-memory-provider.js';
import type { MappingMemoryEntry } from '../types.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MS_PER_DAY = 1000 * 60 * 60 * 24;

function daysAgo(days: number, now = Date.now()): string {
  return new Date(now - days * MS_PER_DAY).toISOString();
}

function makeEntry(
  channelHits: Partial<Record<string, number>>,
  lastAcceptedAt?: string,
  accepted = 5,
): MappingMemoryEntry {
  return {
    sourcePath: 'a',
    targetPath: 'b',
    acceptedCount: accepted,
    rejectedCount: 0,
    averageConfidence: 0.85,
    lastAcceptedAt,
    channelHits: channelHits as MappingMemoryEntry['channelHits'],
  };
}

// ─── computeDecayFactor ───────────────────────────────────────────────────────

describe('computeDecayFactor', () => {
  it('devuelve 1.0 cuando no hay lastAcceptedAt', () => {
    expect(computeDecayFactor(undefined)).toBe(1.0);
  });

  it('devuelve 1.0 para timestamp en el futuro (dato inconsistente, conservador)', () => {
    const future = new Date(Date.now() + 1000).toISOString();
    expect(computeDecayFactor(future)).toBe(1.0);
  });

  it('devuelve ~1.0 para feedback de hoy (age ≈ 0)', () => {
    const now = Date.now();
    const factor = computeDecayFactor(new Date(now).toISOString(), now);
    expect(factor).toBeCloseTo(1.0, 3);
  });

  it(`devuelve exactamente 0.5 después de ${DECAY_HALF_LIFE_DAYS} días`, () => {
    const now = Date.now();
    const ts = daysAgo(DECAY_HALF_LIFE_DAYS, now);
    const factor = computeDecayFactor(ts, now);
    expect(factor).toBeCloseTo(0.5, 4);
  });

  it('devuelve ~0.25 después de 2 vidas medias', () => {
    const now = Date.now();
    const ts = daysAgo(DECAY_HALF_LIFE_DAYS * 2, now);
    const factor = computeDecayFactor(ts, now);
    expect(factor).toBeCloseTo(0.25, 4);
  });

  it('devuelve ~0.125 después de 3 vidas medias', () => {
    const now = Date.now();
    const ts = daysAgo(DECAY_HALF_LIFE_DAYS * 3, now);
    const factor = computeDecayFactor(ts, now);
    expect(factor).toBeCloseTo(0.125, 4);
  });

  it('acepta halfLifeDays custom', () => {
    const now = Date.now();
    const ts = daysAgo(30, now);
    const factor30 = computeDecayFactor(ts, now, 30); // 1 vida media
    expect(factor30).toBeCloseTo(0.5, 4);
  });

  it('permanece en (0, 1] para cualquier antigüedad positiva', () => {
    const now = Date.now();
    for (const days of [1, 7, 30, 90, 180, 365, 730]) {
      const factor = computeDecayFactor(daysAgo(days, now), now);
      expect(factor).toBeGreaterThan(0);
      expect(factor).toBeLessThanOrEqual(1.0);
    }
  });
});

// ─── computeSignalWeights con decay ──────────────────────────────────────────

describe('computeSignalWeights — decay temporal', () => {
  it('una entrada reciente tiene más peso que una antigua con los mismos hits', () => {
    const now = Date.now();

    // Escenario: entrada vieja (270 días) con value dominante
    //            vs entrada reciente (1 día) con lexical dominante
    // El lexical debería dominar porque es más reciente.
    const entries: MappingMemoryEntry[] = [
      makeEntry({ value: 10 }, daysAgo(270, now)),     // 3 vidas medias → factor ≈ 0.125
      makeEntry({ lexical: 10 }, daysAgo(1, now)),     // 1 día → factor ≈ 0.99
    ];

    const weights = computeSignalWeights(entries, undefined, undefined, 1, now);

    // lexical (reciente) debe pesar más que value (antiguo)
    expect(weights.lexical).toBeGreaterThan(weights.value);
  });

  it('dos entradas con misma antigüedad producen distribución basada solo en hits', () => {
    const now = Date.now();
    const ts = daysAgo(30, now); // mismo timestamp para ambas

    const entries: MappingMemoryEntry[] = [
      makeEntry({ value: 8, lexical: 2 }, ts),
      makeEntry({ value: 4, lexical: 1 }, ts),
    ];

    const weights = computeSignalWeights(entries, undefined, undefined, 1, now);

    // value tiene 12 hits, lexical tiene 3 → value domina
    expect(weights.value).toBeGreaterThan(weights.lexical);
  });

  it('una entrada sin lastAcceptedAt recibe decay neutro (1.0) y no pierde peso', () => {
    const now = Date.now();

    // Entrada antigua con timestamp → decay bajo
    // Entrada sin timestamp → decay 1.0
    // Ambas con el mismo canal: value
    const entries: MappingMemoryEntry[] = [
      makeEntry({ value: 5 }, daysAgo(180, now)),  // factor ≈ 0.25
      makeEntry({ lexical: 5 }, undefined),          // factor = 1.0
    ];

    const weights = computeSignalWeights(entries, undefined, undefined, 1, now);

    // lexical (sin timestamp, decay=1.0) debería pesar más que value (180 días de age)
    expect(weights.lexical).toBeGreaterThan(weights.value);
  });

  it('decay devuelve defaults cuando el total ponderado cae bajo minHits', () => {
    const now = Date.now();

    // 3 hits pero con decay fuerte (270 días) → total ponderado << minHits=5
    const entries: MappingMemoryEntry[] = [
      makeEntry({ value: 3 }, daysAgo(270, now)), // 3 * 0.125 ≈ 0.375 hits ponderados
    ];

    const weights = computeSignalWeights(entries, undefined, undefined, 5, now);
    expect(weights).toEqual(DEFAULT_CHANNEL_MULTIPLIERS);
  });

  it('DECAY_HALF_LIFE_DAYS está exportado y es 90', () => {
    expect(DECAY_HALF_LIFE_DAYS).toBe(90);
  });
});
