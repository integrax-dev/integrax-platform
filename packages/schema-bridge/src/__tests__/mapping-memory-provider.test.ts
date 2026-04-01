/**
 * Tests para mapping-memory-provider.ts
 *
 * Cubre: updateMemoryEntry (crear, actualizar, media ponderada),
 * createMappingMemoryOntologyProvider (path directo, leaf, veto, colisión de leaf).
 */

import { describe, it, expect } from 'vitest';
import {
  updateMemoryEntry,
  createMappingMemoryOntologyProvider,
  REJECTION_VETO_RATIO,
  REJECTION_MIN_SAMPLES,
  MIN_ACTIVATION_SAMPLES,
  REJECTION_CONTAMINATION_CAP,
} from '../mapping-memory-provider.js';
import type { MappingMemoryEntry } from '../types.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeEntry(
  sourcePath: string,
  targetPath: string,
  accepted: number,
  rejected: number,
  avgConf = 0.80,
): MappingMemoryEntry {
  return {
    sourcePath,
    targetPath,
    acceptedCount: accepted,
    rejectedCount: rejected,
    averageConfidence: avgConf,
    lastAcceptedAt: accepted > 0 ? new Date().toISOString() : undefined,
  };
}

function makeContext(pathA: string, pathB: string) {
  return { pathA, pathB, nodeA: null, nodeB: null };
}

// ─── updateMemoryEntry ────────────────────────────────────────────────────────

describe('updateMemoryEntry', () => {
  it('crea una nueva entrada cuando el par no existe', () => {
    const result = updateMemoryEntry([], 'userId', 'user_id', true, 0.85);

    expect(result).toHaveLength(1);
    expect(result[0].sourcePath).toBe('userId');
    expect(result[0].targetPath).toBe('user_id');
    expect(result[0].acceptedCount).toBe(1);
    expect(result[0].rejectedCount).toBe(0);
    expect(result[0].averageConfidence).toBe(0.85);
    expect(result[0].lastAcceptedAt).toBeDefined();
  });

  it('crea una entrada con rejectedCount=1 cuando accepted=false', () => {
    const result = updateMemoryEntry([], 'price', 'monto', false, 0.60);

    expect(result[0].acceptedCount).toBe(0);
    expect(result[0].rejectedCount).toBe(1);
    expect(result[0].lastAcceptedAt).toBeUndefined();
  });

  it('incrementa acceptedCount en una entrada existente', () => {
    const existing = [makeEntry('email', 'correo', 2, 0, 0.90)];
    const result = updateMemoryEntry(existing, 'email', 'correo', true, 0.95);

    expect(result).toHaveLength(1);
    expect(result[0].acceptedCount).toBe(3);
    expect(result[0].rejectedCount).toBe(0);
  });

  it('recalcula la media ponderada acumulada correctamente', () => {
    // avg inicial = 0.80 con 4 muestras totales (2+2)
    const existing = [makeEntry('total', 'importe', 2, 2, 0.80)];
    const result = updateMemoryEntry(existing, 'total', 'importe', true, 1.00);

    // (0.80 * 4 + 1.00) / 5 = 4.20 / 5 = 0.84
    expect(result[0].averageConfidence).toBeCloseTo(0.84, 5);
  });

  it('normaliza camelCase a snake_case antes de comparar rutas', () => {
    const existing = [makeEntry('userId', 'user_id', 1, 0, 0.80)];
    // "user_id" y "userId" deben resolver al mismo token normalizado
    const result = updateMemoryEntry(existing, 'user_id', 'userId', true, 0.90);

    // Debe actualizar la entrada existente, no crear una nueva
    expect(result).toHaveLength(1);
    expect(result[0].acceptedCount).toBe(2);
  });

  it('no modifica otras entradas del array', () => {
    const entries = [
      makeEntry('a', 'a2', 1, 0),
      makeEntry('b', 'b2', 1, 0),
    ];
    const result = updateMemoryEntry(entries, 'a', 'a2', true, 0.80);

    expect(result[1]).toBe(entries[1]); // referencia sin cambios
    expect(result).toHaveLength(2);
  });
});

// ─── createMappingMemoryOntologyProvider ──────────────────────────────────────

describe('createMappingMemoryOntologyProvider', () => {
  it('devuelve un score para un par de rutas directas conocidas', () => {
    const provider = createMappingMemoryOntologyProvider([
      makeEntry('customer.email', 'client.correo', 5, 0, 0.88),
    ]);

    const match = provider.match(makeContext('customer.email', 'client.correo'));
    expect(match).not.toBeNull();
    expect(match!.label).toBe('mapping_memory_path');
    expect(match!.score).toBeGreaterThan(0.55);
  });

  it('devuelve null para un par desconocido', () => {
    const provider = createMappingMemoryOntologyProvider([]);

    const match = provider.match(makeContext('foo', 'bar'));
    expect(match).toBeNull();
  });

  it('usa el leaf como fallback cuando no hay coincidencia de ruta completa', () => {
    const provider = createMappingMemoryOntologyProvider([
      makeEntry('email', 'correo', 4, 0, 0.85),
    ]);

    // Ruta diferente pero mismo leaf
    const match = provider.match(makeContext('customer.email', 'client.correo'));
    expect(match).not.toBeNull();
    expect(match!.label).toBe('mapping_memory_leaf');
  });

  it('veta un par con ratio de rechazo ≥ REJECTION_VETO_RATIO y ≥ REJECTION_MIN_SAMPLES muestras', () => {
    // 3 rechazos / 3 total = 100% >= 70% → vetado
    const provider = createMappingMemoryOntologyProvider([
      makeEntry('total', 'monto', 0, 3, 0.80),
    ]);

    const match = provider.match(makeContext('total', 'monto'));
    expect(match).toBeNull();
  });

  it('NO veta un par con menos de REJECTION_MIN_SAMPLES muestras aunque el ratio sea alto', () => {
    // 2 rechazos / 2 total = 100% pero < 3 muestras → no vetado
    const provider = createMappingMemoryOntologyProvider([
      makeEntry('total', 'monto', 0, 2, 0.80),
    ]);

    const match = provider.match(makeContext('total', 'monto'));
    expect(match).not.toBeNull();
  });

  it('no veta un par con ratio de rechazo menor al umbral', () => {
    // 1 rechazo / 4 total = 25% < 70% → no vetado
    const provider = createMappingMemoryOntologyProvider([
      makeEntry('price', 'precio', 3, 1, 0.80),
    ]);

    const match = provider.match(makeContext('price', 'precio'));
    expect(match).not.toBeNull();
  });

  it('usa el ID de provider dado en las opciones', () => {
    const provider = createMappingMemoryOntologyProvider(
      [makeEntry('a', 'b', 1, 0, 0.80)],
      { providerId: 'custom-provider' },
    );

    expect(provider.id).toBe('custom-provider');
  });

  it('en colisión de leaf conserva la entrada con más feedback total', () => {
    // Dos entradas con el mismo leaf pero distinta ruta completa
    // La primera tiene 1 muestra, la segunda tiene 5 muestras → debe ganar la segunda
    const provider = createMappingMemoryOntologyProvider([
      makeEntry('a.email', 'x.correo', 1, 0, 0.80),
      makeEntry('b.email', 'y.correo', 3, 2, 0.75),
    ]);

    const match = provider.match(makeContext('c.email', 'z.correo'));
    expect(match).not.toBeNull();
    // La entrada ganadora tiene 5 muestras → confidenceScore más alto
    expect(match!.score).toBeGreaterThan(0.55);
  });

  it('respeta los umbrales custom de vetoRatio y minSamples', () => {
    // Con vetoRatio=0.5 y minSamples=2, una entrada con 1/2 rechazos debe ser vetada
    const provider = createMappingMemoryOntologyProvider(
      [makeEntry('id', 'identifier', 1, 1, 0.80)],
      { rejectionVetoRatio: 0.50, rejectionMinSamples: 2 },
    );

    const match = provider.match(makeContext('id', 'identifier'));
    expect(match).toBeNull();
  });

  it('devuelve null tanto para path directo como para leaf si ambos están vetados', () => {
    const provider = createMappingMemoryOntologyProvider([
      makeEntry('order.total', 'pedido.monto', 0, 5, 0.80),
    ]);

    // Coincidencia de path directo → vetada
    expect(provider.match(makeContext('order.total', 'pedido.monto'))).toBeNull();

    // Coincidencia de leaf → también vetada
    expect(provider.match(makeContext('x.total', 'y.monto'))).toBeNull();
  });
});

// ─── minActivationSamples ─────────────────────────────────────────────────────

describe('minActivationSamples', () => {
  it('devuelve null si el total de feedbacks es menor al umbral de activación (default=2)', () => {
    // 1 solo accepted — por debajo del umbral
    const provider = createMappingMemoryOntologyProvider([
      makeEntry('amount', 'monto', 1, 0, 0.90),
    ]);
    expect(provider.match(makeContext('amount', 'monto'))).toBeNull();
  });

  it('emite señal cuando total >= minActivationSamples', () => {
    // 2 feedbacks — exactamente en el umbral
    const provider = createMappingMemoryOntologyProvider([
      makeEntry('amount', 'monto', 2, 0, 0.90),
    ]);
    expect(provider.match(makeContext('amount', 'monto'))).not.toBeNull();
  });

  it('respeta minActivationSamples custom', () => {
    // Con minActivationSamples=5, una entrada con 3 feedbacks no emite señal
    const provider = createMappingMemoryOntologyProvider(
      [makeEntry('id', 'identifier', 3, 0, 0.90)],
      { minActivationSamples: 5 },
    );
    expect(provider.match(makeContext('id', 'identifier'))).toBeNull();
  });

  it('aplica minActivationSamples también al fallback de leaf', () => {
    const provider = createMappingMemoryOntologyProvider([
      makeEntry('email', 'correo', 1, 0, 0.90), // solo 1 feedback — bajo umbral
    ]);
    // Leaf fallback: customer.email → client.correo — no debe emitir señal
    expect(provider.match(makeContext('customer.email', 'client.correo'))).toBeNull();
  });
});

// ─── Contamination cap ────────────────────────────────────────────────────────

describe('contamination cap (un solo reject no contamina demasiado)', () => {
  it('un único rechazo no baja el score más del cap (0.15)', () => {
    // Entrada con 5 aceptaciones y 1 rechazo — el rechazo no debería contaminar mucho
    const entryConReject = makeEntry('price', 'precio', 5, 1, 0.90);
    // Entrada de referencia solo con aceptaciones
    const entrySinReject = makeEntry('price', 'precio', 5, 0, 0.90);

    const providerConReject = createMappingMemoryOntologyProvider([entryConReject]);
    const providerSinReject = createMappingMemoryOntologyProvider([entrySinReject]);

    const scoreConReject = providerConReject.match(makeContext('price', 'precio'))!.score;
    const scoreSinReject = providerSinReject.match(makeContext('price', 'precio'))!.score;

    // La diferencia no debe superar el cap
    expect(scoreSinReject - scoreConReject).toBeLessThanOrEqual(REJECTION_CONTAMINATION_CAP + 0.001);
  });

  it('con 2+ rechazos la penalización completa se aplica', () => {
    // 4 aceptaciones, 2 rechazos — penalización completa permitida
    const entryDosReject = makeEntry('total', 'importe', 4, 2, 0.90);
    const entrySinReject = makeEntry('total', 'importe', 4, 0, 0.90);

    const pConReject = createMappingMemoryOntologyProvider([entryDosReject]);
    const pSinReject = createMappingMemoryOntologyProvider([entrySinReject]);

    const scoreConReject = pConReject.match(makeContext('total', 'importe'))!.score;
    const scoreSinReject = pSinReject.match(makeContext('total', 'importe'))!.score;

    // Con 2 rechazos la diferencia puede superar el cap
    expect(scoreSinReject - scoreConReject).toBeGreaterThan(0);
  });

  it('respeta rejectionContaminationCap custom', () => {
    // Cap muy pequeño (0.05) — un reject no puede bajar más de 5 puntos
    const entry = makeEntry('name', 'nombre', 5, 1, 0.90);
    const providerCap005 = createMappingMemoryOntologyProvider(
      [entry],
      { rejectionContaminationCap: 0.05 },
    );
    const providerSinReject = createMappingMemoryOntologyProvider([
      makeEntry('name', 'nombre', 5, 0, 0.90),
    ]);

    const score = providerCap005.match(makeContext('name', 'nombre'))!.score;
    const scoreRef = providerSinReject.match(makeContext('name', 'nombre'))!.score;

    expect(scoreRef - score).toBeLessThanOrEqual(0.05 + 0.001);
  });
});

// ─── Constantes exportadas ────────────────────────────────────────────────────

describe('constantes exportadas', () => {
  it('REJECTION_VETO_RATIO es 0.70', () => {
    expect(REJECTION_VETO_RATIO).toBe(0.70);
  });

  it('REJECTION_MIN_SAMPLES es 3', () => {
    expect(REJECTION_MIN_SAMPLES).toBe(3);
  });

  it('MIN_ACTIVATION_SAMPLES es 2', () => {
    expect(MIN_ACTIVATION_SAMPLES).toBe(2);
  });

  it('REJECTION_CONTAMINATION_CAP es 0.15', () => {
    expect(REJECTION_CONTAMINATION_CAP).toBe(0.15);
  });
});
