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
  return { pathA, pathB };
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

// ─── REJECTION_VETO_RATIO / REJECTION_MIN_SAMPLES constantes ─────────────────

describe('constantes exportadas', () => {
  it('REJECTION_VETO_RATIO es 0.70', () => {
    expect(REJECTION_VETO_RATIO).toBe(0.70);
  });

  it('REJECTION_MIN_SAMPLES es 3', () => {
    expect(REJECTION_MIN_SAMPLES).toBe(3);
  });
});
