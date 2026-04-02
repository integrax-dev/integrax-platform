import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { computeSignalWeights, DEFAULT_CHANNEL_MULTIPLIERS } from '../src/mapping-memory-provider.js';
import type { MappingMemoryEntry } from '../src/types.js';

describe('Confidence Decay (ID-015)', () => {
  beforeEach(() => {
    // Fijar la fecha para que 'now' sea predecible
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-01T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('debe aplicar un multiplier completo si el feedback es reciente', () => {
    const memory: MappingMemoryEntry[] = [
      {
        sourcePath: 'f', targetPath: 'f2', acceptedCount: 5, rejectedCount: 0, averageConfidence: 0.9,
        lastAcceptedAt: '2026-04-01T10:00:00Z', // Hace 2 horas
        channelHits: { value: 20 }, // Fuerte sesgo hacia 'value'
      }
    ];

    const weights = computeSignalWeights(memory);
    // Para value, share = 1.0. Delta = 0.80. mult = 1.80. Clamped = 1.20
    expect(weights.value).toBe(1.20);
    // Para el resto, share = 0. Delta = -0.20. mult = 0.80. Clamped = 0.80
    expect(weights.lexical).toBe(0.80);
  });

  it('debe degradar la fuerza de la señal si el feedback es antiguo (Half-life 90 días)', () => {
    // Simulamos un entry súper sesgado con 6 hits, que pasará apenas el umbral de 5 hits.
    // Si tiene 90 días, su peso se reduce a la mitad (3 hits efectivos).
    // Como 3 hits efectivos < 5 MIN_HITS_FOR_CHANNEL_WEIGHTS, debería devolver DEFAULT.
    const memory: MappingMemoryEntry[] = [
      {
        sourcePath: 'f', targetPath: 'f2', acceptedCount: 1, rejectedCount: 0, averageConfidence: 0.9,
        lastAcceptedAt: '2026-01-01T12:00:00Z', // Exactamente 90 días antes (aprox)
        channelHits: { value: 6 },
      }
    ];

    const weights = computeSignalWeights(memory, undefined, undefined, 5);
    
    // Deberían ser los default (1.0) porque 6 hits decayeron a ~3, que es menor a 5.
    expect(weights).toEqual(DEFAULT_CHANNEL_MULTIPLIERS);
  });

  it('debe priorizar signals recíentes sobre signals viejas (Decay relativo)', () => {
    const memory: MappingMemoryEntry[] = [
      {
        // Registro viejo (90 días) aportando fuertemente a lexical
        sourcePath: 'l', targetPath: 'l2', acceptedCount: 5, rejectedCount: 0, averageConfidence: 0.9,
        lastAcceptedAt: '2026-01-01T12:00:00Z',
        channelHits: { lexical: 18, structural: 10 }, // Effective = L: 9, S: 5 -> Total 14
      },
      {
        // Registro nuevo aportando a value
        sourcePath: 'v', targetPath: 'v2', acceptedCount: 5, rejectedCount: 0, averageConfidence: 0.9,
        lastAcceptedAt: '2026-04-01T10:00:00Z', // 2 horas
        channelHits: { value: 12, ontology: 10 }, // Effective = V: 12, O: 10 -> Total 22
      }
    ];

    const weights = computeSignalWeights(memory);
    
    // Value (75) debe ganarle a Lexical (50) gracias al decay
    expect(weights.value).toBeGreaterThan(weights.lexical);
  });
});
