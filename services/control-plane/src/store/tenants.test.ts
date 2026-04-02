/**
 * Tests unitarios para store/tenants.ts
 *
 * Mockea el pool de Postgres — no requiere base de datos real.
 * Cubre: getTenant, saveTenant, listTenants, getTenantByApiKeyHash.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { queryMock } = vi.hoisted(() => ({ queryMock: vi.fn() }));

vi.mock('./db.js', () => ({
  pool: { query: queryMock },
}));

import { getTenant, saveTenant, listTenants, getTenantByApiKeyHash } from './tenants.js';
import type { Tenant } from '../types.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeTenantRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'ten_01',
    name: 'Acme',
    plan: 'starter',
    status: 'active',
    owner_id: 'usr_01',
    limits: { requestsPerMinute: 100 },
    metadata: {},
    api_key_hash: 'hash_abc',
    webhook_secret: 'whsec_xyz',
    created_at: new Date('2024-01-01'),
    updated_at: new Date('2024-01-02'),
    ...overrides,
  };
}

// ─── getTenant ────────────────────────────────────────────────────────────────

describe('getTenant', () => {
  beforeEach(() => queryMock.mockReset());

  it('devuelve el tenant mapeado cuando existe la fila', async () => {
    queryMock.mockResolvedValueOnce({ rows: [makeTenantRow()] });

    const tenant = await getTenant('ten_01');

    expect(tenant).not.toBeNull();
    expect(tenant!.id).toBe('ten_01');
    expect(tenant!.name).toBe('Acme');
    expect(tenant!.plan).toBe('starter');
    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining('WHERE id = $1'),
      ['ten_01'],
    );
  });

  it('devuelve null cuando no existe la fila', async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    const tenant = await getTenant('ten_inexistente');
    expect(tenant).toBeNull();
  });
});

// ─── saveTenant ───────────────────────────────────────────────────────────────

describe('saveTenant', () => {
  beforeEach(() => queryMock.mockReset());

  it('ejecuta un upsert con todos los campos del tenant', async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    const tenant: Tenant = {
      id: 'ten_02',
      name: 'Beta Corp',
      plan: 'professional',
      status: 'active',
      ownerId: 'usr_02',
      limits: { requestsPerMinute: 500, jobsPerMinute: 1000, maxConcurrentJobs: 50, maxWorkflows: 50, maxConnectors: 20, dataRetentionDays: 90 },
      metadata: { country: 'AR' },
      apiKeyHash: 'hash_def',
      webhookSecret: 'whsec_123',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await saveTenant(tenant);

    const [sql, params] = queryMock.mock.calls[0];
    expect(sql).toContain('ON CONFLICT');
    expect(params[0]).toBe('ten_02');
    expect(params[1]).toBe('Beta Corp');
  });
});

// ─── listTenants ──────────────────────────────────────────────────────────────

describe('listTenants', () => {
  beforeEach(() => queryMock.mockReset());

  it('devuelve los tenants y el total para paginación', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ count: '2' }] })
      .mockResolvedValueOnce({ rows: [makeTenantRow({ id: 'ten_01' }), makeTenantRow({ id: 'ten_02', name: 'Beta' })] });

    const result = await listTenants({ page: 1, pageSize: 20 });

    expect(result.totalItems).toBe(2);
    expect(result.data).toHaveLength(2);
    expect(result.data[0].id).toBe('ten_01');
  });

  it('filtra por status cuando se provee', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ count: '1' }] })
      .mockResolvedValueOnce({ rows: [makeTenantRow({ status: 'suspended' })] });

    await listTenants({ status: 'suspended', page: 1, pageSize: 20 });

    const [countSql] = queryMock.mock.calls[0];
    expect(countSql).toContain('status');
  });
});

// ─── getTenantByApiKeyHash ────────────────────────────────────────────────────

describe('getTenantByApiKeyHash', () => {
  beforeEach(() => queryMock.mockReset());

  it('devuelve el tenant cuando el hash coincide', async () => {
    queryMock.mockResolvedValueOnce({ rows: [makeTenantRow()] });

    const tenant = await getTenantByApiKeyHash('hash_abc');
    expect(tenant).not.toBeNull();
    expect(tenant!.apiKeyHash).toBe('hash_abc');
  });

  it('devuelve null si no hay coincidencia', async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    const tenant = await getTenantByApiKeyHash('hash_inexistente');
    expect(tenant).toBeNull();
  });
});
