/**
 * Tests unitarios para store/mapping-memory-repository.ts
 *
 * Mockea pool de Postgres y el cacheAdapter para no requerir infraestructura.
 * Cubre: loadMappingMemory (cache hit, cache miss, escritura en cache),
 * upsertEntry (SQL correcto, invalidación de cache), pruneMemory.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const queryMock = vi.fn();

vi.mock('./db.js', () => ({
  pool: { query: queryMock },
}));

import {
  loadMappingMemory,
  upsertEntry,
  pruneMemory,
  setCacheAdapter,
} from './mapping-memory-repository.js';
import { MemoryCacheAdapter } from './cache-adapter.js';

// ─── Setup: cache fresco antes de cada test ───────────────────────────────────

beforeEach(() => {
  queryMock.mockReset();
  // Inyectar un adapter limpio para aislar los tests entre sí
  setCacheAdapter(new MemoryCacheAdapter({ maxEntries: 500 }));
});

// ─── loadMappingMemory ────────────────────────────────────────────────────────

describe('loadMappingMemory', () => {
  it('consulta Postgres en el primer llamado (cache miss)', async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          source_connector_id: 'mp',
          target_connector_id: 'cl',
          source_path: 'email',
          target_path: 'correo',
          accepted_count: 3,
          rejected_count: 0,
          average_confidence: 0.88,
          last_accepted_at: new Date('2024-01-15'),
        },
      ],
    });

    const entries = await loadMappingMemory('ten_01', 'mp', 'cl');

    expect(queryMock).toHaveBeenCalledTimes(1);
    expect(entries).toHaveLength(1);
    expect(entries[0].sourcePath).toBe('email');
    expect(entries[0].acceptedCount).toBe(3);
    expect(entries[0].lastAcceptedAt).toBeDefined();
  });

  it('no consulta Postgres en el segundo llamado (cache hit)', async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    await loadMappingMemory('ten_01', 'mp', 'cl');
    await loadMappingMemory('ten_01', 'mp', 'cl');

    // Solo una llamada a la DB gracias al cache
    expect(queryMock).toHaveBeenCalledTimes(1);
  });

  it('convierte last_accepted_at null a undefined en la entrada', async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          source_connector_id: 'mp',
          target_connector_id: 'cl',
          source_path: 'total',
          target_path: 'monto',
          accepted_count: 0,
          rejected_count: 2,
          average_confidence: 0.60,
          last_accepted_at: null,
        },
      ],
    });

    const [entry] = await loadMappingMemory('ten_01', 'mp', 'cl');
    expect(entry.lastAcceptedAt).toBeUndefined();
  });

  it('devuelve array vacío cuando no hay filas en Postgres', async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    const entries = await loadMappingMemory('ten_01', 'mp', 'cl');
    expect(entries).toEqual([]);
  });
});

// ─── upsertEntry ──────────────────────────────────────────────────────────────

describe('upsertEntry', () => {
  it('ejecuta INSERT con ON CONFLICT y los 9 parámetros correctos', async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    await upsertEntry('ten_01', 'mp', 'cl', 'email', 'correo', true, 0.90);

    const [sql, params] = queryMock.mock.calls[0];
    expect(sql).toContain('ON CONFLICT');
    expect(sql).toContain('average_confidence');
    expect(params[0]).toBe('ten_01');
    expect(params[1]).toBe('mp');
    expect(params[2]).toBe('cl');
    expect(params[3]).toBe('email');
    expect(params[4]).toBe('correo');
    expect(params[5]).toBe(1);   // acceptedDelta
    expect(params[6]).toBe(0);   // rejectedDelta
    expect(params[7]).toBe(0.90); // confidence
    expect(params[8]).toBeInstanceOf(Date); // lastAcceptedAt
  });

  it('pasa null como lastAcceptedAt cuando accepted=false', async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    await upsertEntry('ten_01', 'mp', 'cl', 'total', 'monto', false, 0.50);

    const [, params] = queryMock.mock.calls[0];
    expect(params[5]).toBe(0);   // acceptedDelta = 0
    expect(params[6]).toBe(1);   // rejectedDelta = 1
    expect(params[8]).toBeNull(); // lastAcceptedAt = null
  });

  it('invalida el cache después del upsert (fuerza nueva consulta a DB)', async () => {
    // Primer load → llena el cache
    queryMock.mockResolvedValueOnce({ rows: [] });
    await loadMappingMemory('ten_01', 'mp', 'cl');

    // Upsert → invalida cache
    queryMock.mockResolvedValueOnce({ rows: [] }); // upsert
    await upsertEntry('ten_01', 'mp', 'cl', 'id', 'identifier', true, 0.80);

    // Segundo load → debe ir a DB de nuevo
    queryMock.mockResolvedValueOnce({ rows: [] });
    await loadMappingMemory('ten_01', 'mp', 'cl');

    // Llamadas: 1 load inicial + 1 upsert + 1 load post-invalidación = 3
    expect(queryMock).toHaveBeenCalledTimes(3);
  });
});

// ─── pruneMemory ──────────────────────────────────────────────────────────────

describe('pruneMemory', () => {
  it('devuelve el número de filas eliminadas', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ count: '7' }] });

    const deleted = await pruneMemory('ten_01');
    expect(deleted).toBe(7);
  });

  it('devuelve 0 si no hay filas para eliminar', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ count: '0' }] });

    const deleted = await pruneMemory('ten_01');
    expect(deleted).toBe(0);
  });

  it('pasa maxAgeDays y maxRejectionRatio como parámetros SQL', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ count: '0' }] });

    await pruneMemory('ten_01', { maxAgeDays: 90, maxRejectionRatio: 0.95 });

    const [, params] = queryMock.mock.calls[0];
    expect(params[0]).toBe('ten_01');
    expect(params[1]).toBe(90);
    expect(params[2]).toBe(0.95);
  });

  it('usa valores por defecto cuando no se pasan opciones', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ count: '0' }] });

    await pruneMemory('ten_01');

    const [, params] = queryMock.mock.calls[0];
    expect(params[1]).toBe(180);  // maxAgeDays default
    expect(params[2]).toBe(0.90); // maxRejectionRatio default
  });

  it('invalida el cache completo del tenant después de prune', async () => {
    // Llenar el cache para dos pares distintos del mismo tenant
    queryMock
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    await loadMappingMemory('ten_01', 'mp', 'cl');
    await loadMappingMemory('ten_01', 'shopify', 'tiendanube');

    // pruneMemory limpia todo el tenant
    queryMock.mockResolvedValueOnce({ rows: [{ count: '0' }] });
    await pruneMemory('ten_01');

    // Ambos pares deben ir a DB de nuevo
    queryMock
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    await loadMappingMemory('ten_01', 'mp', 'cl');
    await loadMappingMemory('ten_01', 'shopify', 'tiendanube');

    // 2 iniciales + 1 prune + 2 post-prune = 5
    expect(queryMock).toHaveBeenCalledTimes(5);
  });
});
