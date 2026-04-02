/**
 * Integration-engine — ActivepiecesAdapter matrix tests
 * Covers: triggerFlow, getRunStatus, cancelRun, listFlows, enable/disableFlow,
 * IdMapper combinations, status mapping, tenant isolation, error propagation.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ActivepiecesAdapter } from '../activepieces/index.js';
import { IntegrationEngineError } from '../errors.js';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

function mockOk(body: unknown) {
  fetchMock.mockResolvedValueOnce({
    ok: true,
    status: 200,
    text: async () => JSON.stringify(body),
  });
}

function mockError(status: number, body = 'error') {
  fetchMock.mockResolvedValueOnce({
    ok: false,
    status,
    text: async () => body,
  });
}

function makeRun(overrides: Record<string, unknown> = {}) {
  return { id: 'run-1', status: 'RUNNING', startTime: '2024-01-01T00:00:00Z', ...overrides };
}

const adapter = new ActivepiecesAdapter('http://engine:8080', 'test-key');

beforeEach(() => fetchMock.mockReset());

// ─── triggerFlow — tenant × payload matrix ────────────────────────────────────

describe('triggerFlow', () => {
  const tenantCases: Array<{ tenant: string; flow: string }> = [
    { tenant: 'tenant-arg-001', flow: 'factura-afip' },
    { tenant: 'tenant-bra-001', flow: 'nota-fiscal' },
    { tenant: 'tenant-mex-001', flow: 'cfdi-emision' },
    { tenant: 'tenant-chl-001', flow: 'dte-factura' },
    { tenant: 'tenant-col-001', flow: 'fe-colombia' },
    { tenant: 'tenant-per-001', flow: 'cpe-sunat' },
    { tenant: 'tenant-ury-001', flow: 'cfe-dgi' },
    { tenant: 'enterprise-latam', flow: 'multi-pais' },
    { tenant: 'free-tier-1', flow: 'simple-flow' },
    { tenant: 'a', flow: 'b' },
  ];

  it.each(tenantCases)('triggers flow for tenant $tenant', async ({ tenant, flow }) => {
    mockOk({ id: `run-${tenant}`, status: 'RUNNING', startTime: '2024-01-01T00:00:00Z' });
    const result = await adapter.triggerFlow({ flowId: flow, tenantId: tenant, payload: { key: 'val' } });
    expect(result.runId).toBe(`run-${tenant}`);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  const payloads = [
    {},
    { orderId: 'ORD-001', amount: 15000.50, currency: 'ARS' },
    { invoiceNumber: 'FC-A-00001-00000001', cuit: '30-11223344-5' },
    { items: [{ sku: 'SKU-1', qty: 2 }], total: 100 },
    { nested: { deep: { value: true } } },
    { arrayField: [1, 2, 3, 4, 5] },
    { nullField: null, zeroField: 0, emptyString: '' },
    { largeText: 'x'.repeat(1000) },
  ];

  it.each(payloads)('forwards payload correctly for %j', async (payload) => {
    mockOk({ id: 'run-x', status: 'RUNNING', startTime: '2024-01-01T00:00:00Z' });
    await adapter.triggerFlow({ flowId: 'f', tenantId: 't', payload });
    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body);
    expect(body.payload).toEqual(payload);
  });

  const errorCases: Array<{ status: number; name: string }> = [
    { status: 400, name: 'bad request' },
    { status: 401, name: 'unauthorized' },
    { status: 403, name: 'forbidden' },
    { status: 404, name: 'not found' },
    { status: 422, name: 'unprocessable' },
    { status: 429, name: 'rate limited' },
    { status: 500, name: 'server error' },
    { status: 502, name: 'bad gateway' },
    { status: 503, name: 'unavailable' },
  ];

  it.each(errorCases)('throws IntegrationEngineError on HTTP $status ($name)', async ({ status }) => {
    mockError(status);
    await expect(adapter.triggerFlow({ flowId: 'f', tenantId: 't', payload: {} }))
      .rejects.toThrow(IntegrationEngineError);
  });

  it('throws on network failure', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'));
    await expect(adapter.triggerFlow({ flowId: 'f', tenantId: 't', payload: {} }))
      .rejects.toThrow();
  });
});

// ─── getRunStatus — status mapping matrix ────────────────────────────────────

describe('getRunStatus', () => {
  const statusMap: Array<{ apStatus: string; expected: string }> = [
    { apStatus: 'RUNNING', expected: 'running' },
    { apStatus: 'SUCCEEDED', expected: 'succeeded' },
    { apStatus: 'FAILED', expected: 'failed' },
    { apStatus: 'PAUSED', expected: 'paused' },
    { apStatus: 'STOPPED', expected: 'failed' },
    { apStatus: 'TIMEOUT', expected: 'failed' },
  ];

  it.each(statusMap)('maps AP status $apStatus → $expected', async ({ apStatus, expected }) => {
    mockOk(makeRun({ status: apStatus, tenantRef: 'tenant-1' }));
    const result = await adapter.getRunStatus('tenant-1', 'run-1');
    expect(result.status).toBe(expected);
  });

  it('includes runId in result', async () => {
    mockOk(makeRun({ id: 'run-xyz', tenantRef: 'tenant-1' }));
    const result = await adapter.getRunStatus('tenant-1', 'run-xyz');
    expect(result.runId).toBe('run-xyz');
  });

  it('includes startedAt from startTime', async () => {
    const startTime = '2025-03-15T10:00:00Z';
    mockOk(makeRun({ startTime, tenantRef: 'tenant-1' }));
    const result = await adapter.getRunStatus('tenant-1', 'run-1');
    expect(result.startedAt).toBe(startTime);
  });

  it('includes finishedAt when present', async () => {
    const finishTime = '2025-03-15T10:05:00Z';
    mockOk(makeRun({ finishTime, tenantRef: 'tenant-1', status: 'SUCCEEDED' }));
    const result = await adapter.getRunStatus('tenant-1', 'run-1');
    expect(result.finishedAt).toBe(finishTime);
  });

  it('extracts output from last task', async () => {
    mockOk(makeRun({
      tenantRef: 'tenant-1',
      status: 'SUCCEEDED',
      tasks: [
        { output: { step: 1 } },
        { output: { step: 2, result: 'ok' } },
      ],
    }));
    const result = await adapter.getRunStatus('tenant-1', 'run-1');
    expect(result.output?.result).toEqual({ step: 2, result: 'ok' });
  });

  it('handles run with no tasks (no output)', async () => {
    mockOk(makeRun({ tenantRef: 'tenant-1', tasks: [] }));
    const result = await adapter.getRunStatus('tenant-1', 'run-1');
    expect(result.output).toBeUndefined();
  });

  it('throws 403 when tenantRef mismatches (tenant isolation)', async () => {
    mockOk(makeRun({ tenantRef: 'tenant-other' }));
    await expect(adapter.getRunStatus('tenant-1', 'run-1'))
      .rejects.toThrow(IntegrationEngineError);
  });

  it('allows run without tenantRef (engine does not return it)', async () => {
    // tenantRef absent in response — should not throw
    mockOk(makeRun({ /* no tenantRef */ }));
    const result = await adapter.getRunStatus('tenant-1', 'run-1');
    expect(result.runId).toBe('run-1');
  });

  const errorCases = [401, 403, 404, 500, 503];
  it.each(errorCases)('throws IntegrationEngineError on HTTP %i', async (status) => {
    mockError(status);
    await expect(adapter.getRunStatus('tenant-1', 'run-1'))
      .rejects.toThrow(IntegrationEngineError);
  });
});

// ─── cancelRun ────────────────────────────────────────────────────────────────

describe('cancelRun', () => {
  it('calls stop endpoint and resolves', async () => {
    mockOk({});
    await expect(adapter.cancelRun('tenant-1', 'run-abc')).resolves.toBeUndefined();
  });

  it('includes tenantRef in stop URL', async () => {
    mockOk({});
    await adapter.cancelRun('tenant-99', 'run-xyz');
    const [url] = fetchMock.mock.calls[0];
    expect(url).toContain('tenantRef=tenant-99');
    expect(url).toContain('run-xyz');
  });

  const tenants = ['tenant-ar', 'tenant-br', 'tenant-mx', 'enterprise-latam'];
  it.each(tenants)('cancels run for tenant %s', async (tenant) => {
    mockOk({});
    await expect(adapter.cancelRun(tenant, 'run-1')).resolves.toBeUndefined();
  });

  it('throws on 404 when run does not exist', async () => {
    mockError(404);
    await expect(adapter.cancelRun('tenant-1', 'nonexistent')).rejects.toThrow();
  });
});

// ─── listFlows ────────────────────────────────────────────────────────────────

describe('listFlows', () => {
  it('returns empty array when no flows', async () => {
    mockOk({ data: [], next: undefined });
    const flows = await adapter.listFlows('tenant-1');
    expect(flows).toEqual([]);
  });

  it('maps ENABLED flow correctly', async () => {
    mockOk({ data: [{ id: 'f-1', status: 'ENABLED', version: { displayName: 'My Flow' } }] });
    const flows = await adapter.listFlows('tenant-1');
    expect(flows[0]).toMatchObject({ id: 'f-1', name: 'My Flow', enabled: true, tenantId: 'tenant-1' });
  });

  it('maps DISABLED flow correctly', async () => {
    mockOk({ data: [{ id: 'f-2', status: 'DISABLED', version: { displayName: 'Old Flow' } }] });
    const flows = await adapter.listFlows('tenant-1');
    expect(flows[0].enabled).toBe(false);
  });

  it('paginates through multiple pages', async () => {
    mockOk({ data: [{ id: 'f-1', status: 'ENABLED', version: { displayName: 'Flow 1' } }], next: 'cursor-2' });
    mockOk({ data: [{ id: 'f-2', status: 'ENABLED', version: { displayName: 'Flow 2' } }], next: undefined });
    const flows = await adapter.listFlows('tenant-1');
    expect(flows).toHaveLength(2);
    expect(flows.map(f => f.id)).toEqual(['f-1', 'f-2']);
  });

  it('handles 3-page pagination', async () => {
    mockOk({ data: Array.from({ length: 5 }, (_, i) => ({ id: `f-${i}`, status: 'ENABLED', version: { displayName: `Flow ${i}` } })), next: 'c2' });
    mockOk({ data: Array.from({ length: 5 }, (_, i) => ({ id: `f-${i+5}`, status: 'DISABLED', version: { displayName: `Flow ${i+5}` } })), next: 'c3' });
    mockOk({ data: Array.from({ length: 3 }, (_, i) => ({ id: `f-${i+10}`, status: 'ENABLED', version: { displayName: `Flow ${i+10}` } })), next: undefined });
    const flows = await adapter.listFlows('tenant-1');
    expect(flows).toHaveLength(13);
  });

  const tenants = ['tenant-ar', 'tenant-br', 'tenant-mx', 'enterprise'];
  it.each(tenants)('scopes query to tenantRef for %s', async (tenant) => {
    mockOk({ data: [] });
    await adapter.listFlows(tenant);
    const [url] = fetchMock.mock.calls[0];
    expect(url).toContain(`tenantRef=${tenant}`);
  });

  it('throws IntegrationEngineError on 401', async () => {
    mockError(401);
    await expect(adapter.listFlows('tenant-1')).rejects.toThrow(IntegrationEngineError);
  });
});

// ─── enableFlow / disableFlow ─────────────────────────────────────────────────

describe('enableFlow', () => {
  const flowCases = ['flow-afip', 'flow-mp', 'flow-contabilium', 'flow-sheets', 'flow-whatsapp'];

  it.each(flowCases)('enables flow %s', async (flowId) => {
    mockOk({});
    await expect(adapter.enableFlow('tenant-1', flowId)).resolves.toBeUndefined();
    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body);
    expect(body.status).toBe('ENABLED');
  });

  it.each(flowCases)('disables flow %s', async (flowId) => {
    mockOk({});
    await expect(adapter.disableFlow('tenant-1', flowId)).resolves.toBeUndefined();
    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body);
    expect(body.status).toBe('DISABLED');
  });

  it('throws on 404 when flow not found', async () => {
    mockError(404);
    await expect(adapter.enableFlow('tenant-1', 'nonexistent')).rejects.toThrow();
  });

  it('throws on 403 when not authorized', async () => {
    mockError(403);
    await expect(adapter.disableFlow('tenant-1', 'flow-x')).rejects.toThrow();
  });
});

// ─── IdMapper combinations ────────────────────────────────────────────────────

describe('IdMapper', () => {
  const mapperCases: Array<{
    label: string;
    mapper: { flowId?: (t: string, id: string) => string; tenantRef?: (t: string) => string };
    tenant: string;
    flow: string;
    expectedFlowId: string;
    expectedTenantRef: string;
  }> = [
    {
      label: 'prefix flow ID',
      mapper: { flowId: (_t, id) => `ext-${id}` },
      tenant: 'tenant-1', flow: 'my-flow',
      expectedFlowId: 'ext-my-flow', expectedTenantRef: 'tenant-1',
    },
    {
      label: 'prefix tenant ref',
      mapper: { tenantRef: (t) => `proj-${t}` },
      tenant: 'tenant-1', flow: 'my-flow',
      expectedFlowId: 'my-flow', expectedTenantRef: 'proj-tenant-1',
    },
    {
      label: 'both mapper functions',
      mapper: { flowId: (_t, id) => `ext-${id}`, tenantRef: (t) => `proj-${t}` },
      tenant: 'tenant-1', flow: 'my-flow',
      expectedFlowId: 'ext-my-flow', expectedTenantRef: 'proj-tenant-1',
    },
    {
      label: 'tenant-aware flow ID mapping',
      mapper: { flowId: (t, id) => `${t}:${id}` },
      tenant: 'tenant-ar', flow: 'afip-flow',
      expectedFlowId: 'tenant-ar:afip-flow', expectedTenantRef: 'tenant-ar',
    },
    {
      label: 'UUID tenant ref',
      mapper: { tenantRef: (t) => `uuid-${t}-suffix` },
      tenant: 'tenant-br', flow: 'nfe-flow',
      expectedFlowId: 'nfe-flow', expectedTenantRef: 'uuid-tenant-br-suffix',
    },
  ];

  it.each(mapperCases)('$label', async ({ mapper, tenant, flow, expectedFlowId, expectedTenantRef }) => {
    const mapped = new ActivepiecesAdapter('http://engine:8080', 'key', mapper);
    mockOk({ id: 'run-1', status: 'RUNNING', startTime: '2024-01-01T00:00:00Z' });
    await mapped.triggerFlow({ flowId: flow, tenantId: tenant, payload: {} });
    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body);
    expect(body.flowVersionId).toBe(expectedFlowId);
    expect(body.tenantRef).toBe(expectedTenantRef);
  });

  it('passes correct API key in Authorization header', async () => {
    const keyed = new ActivepiecesAdapter('http://engine:8080', 'super-secret-key');
    mockOk({ id: 'run-1', status: 'RUNNING', startTime: '2024-01-01T00:00:00Z' });
    await keyed.triggerFlow({ flowId: 'f', tenantId: 't', payload: {} });
    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers?.['Authorization']).toContain('super-secret-key');
  });
});

// ─── IntegrationEngineError ───────────────────────────────────────────────────

describe('IntegrationEngineError', () => {
  const statusCodes = [400, 401, 403, 404, 409, 422, 429, 500, 502, 503, 504];

  it.each(statusCodes)('preserves HTTP status %i in error', (status) => {
    const err = new IntegrationEngineError('something failed', status);
    expect(err.statusCode).toBe(status);
    expect(err.message).toBe('something failed');
    expect(err).toBeInstanceOf(Error);
  });

  it('has correct name', () => {
    const err = new IntegrationEngineError('fail', 500);
    expect(err.name).toBe('IntegrationEngineError');
  });

  const messages = [
    'Run not found',
    'Flow disabled',
    'Tenant mismatch',
    'API key invalid',
    'Rate limit exceeded',
    'Service temporarily unavailable',
  ];
  it.each(messages)('stores message: %s', (msg) => {
    const err = new IntegrationEngineError(msg, 400);
    expect(err.message).toBe(msg);
  });
});
