/**
 * Tests unitarios para store/tenant-connectors.ts
 *
 * Mockea el pool de Postgres — no requiere base de datos real.
 * Cubre: getTenantConnector, findTenantConnector, listTenantConnectors,
 *        saveTenantConnector (upsert + RETURNING id), deleteTenantConnector.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { queryMock } = vi.hoisted(() => ({ queryMock: vi.fn() }));

vi.mock('./db.js', () => ({
  pool: { query: queryMock },
}));

import {
  getTenantConnector,
  findTenantConnector,
  listTenantConnectors,
  saveTenantConnector,
  deleteTenantConnector,
} from './tenant-connectors.js';
import type { TenantConnector } from '../types.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'tc_01',
    tenant_id: 'ten_01',
    connector_id: 'mercadopago',
    status: 'configured',
    credentials: { access_token: 'enc:abc' },
    last_tested_at: null,
    last_test_result: null,
    created_at: new Date('2024-01-01'),
    updated_at: new Date('2024-01-02'),
    ...overrides,
  };
}

function makeTenantConnector(overrides: Partial<TenantConnector> = {}): TenantConnector {
  return {
    id: 'tc_02',
    tenantId: 'ten_01',
    connectorId: 'afip-wsfe',
    status: 'configured',
    credentials: { cuit: 'enc:123' },
    lastTestedAt: null,
    lastTestResult: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// ─── getTenantConnector ───────────────────────────────────────────────────────

describe('getTenantConnector', () => {
  beforeEach(() => queryMock.mockReset());

  it('devuelve el conector mapeado cuando existe', async () => {
    queryMock.mockResolvedValueOnce({ rows: [makeRow()] });

    const tc = await getTenantConnector('tc_01');

    expect(tc).not.toBeNull();
    expect(tc!.id).toBe('tc_01');
    expect(tc!.connectorId).toBe('mercadopago');
    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining('WHERE id = $1'),
      ['tc_01'],
    );
  });

  it('devuelve null cuando no existe', async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    expect(await getTenantConnector('inexistente')).toBeNull();
  });
});

// ─── findTenantConnector ──────────────────────────────────────────────────────

describe('findTenantConnector', () => {
  beforeEach(() => queryMock.mockReset());

  it('busca por tenant_id y connector_id', async () => {
    queryMock.mockResolvedValueOnce({ rows: [makeRow()] });

    const tc = await findTenantConnector('ten_01', 'mercadopago');

    expect(tc).not.toBeNull();
    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining('tenant_id = $1 AND connector_id = $2'),
      ['ten_01', 'mercadopago'],
    );
  });

  it('devuelve null si no está configurado', async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    expect(await findTenantConnector('ten_01', 'shopify')).toBeNull();
  });
});

// ─── listTenantConnectors ─────────────────────────────────────────────────────

describe('listTenantConnectors', () => {
  beforeEach(() => queryMock.mockReset());

  it('devuelve todos los conectores del tenant', async () => {
    queryMock.mockResolvedValueOnce({
      rows: [makeRow({ id: 'tc_01' }), makeRow({ id: 'tc_02', connector_id: 'afip-wsfe' })],
    });

    const list = await listTenantConnectors('ten_01');

    expect(list).toHaveLength(2);
    expect(list[0].connectorId).toBe('mercadopago');
    expect(list[1].connectorId).toBe('afip-wsfe');
  });

  it('devuelve array vacío si el tenant no tiene conectores', async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    expect(await listTenantConnectors('ten_sin_conectores')).toEqual([]);
  });
});

// ─── saveTenantConnector ──────────────────────────────────────────────────────

describe('saveTenantConnector', () => {
  beforeEach(() => queryMock.mockReset());

  it('hace upsert y devuelve el id que guardó Postgres (RETURNING id)', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: 'tc_01' }] });

    const storedId = await saveTenantConnector(makeTenantConnector());

    expect(storedId).toBe('tc_01');

    const [sql] = queryMock.mock.calls[0];
    expect(sql).toContain('ON CONFLICT (tenant_id, connector_id)');
    expect(sql).toContain('RETURNING id');
  });

  it('la query usa ON CONFLICT (tenant_id, connector_id) — no (id)', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: 'tc_existing' }] });

    await saveTenantConnector(makeTenantConnector({ id: 'tc_new' }));

    const [sql] = queryMock.mock.calls[0];
    // La clave de conflicto debe ser el par natural, no el id generado
    expect(sql).toContain('ON CONFLICT (tenant_id, connector_id)');
    expect(sql).not.toContain('ON CONFLICT (id)');
  });
});

// ─── deleteTenantConnector ────────────────────────────────────────────────────

describe('deleteTenantConnector', () => {
  beforeEach(() => queryMock.mockReset());

  it('ejecuta DELETE WHERE id = $1', async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    await deleteTenantConnector('tc_01');

    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM tenant_connectors WHERE id = $1'),
      ['tc_01'],
    );
  });
});
