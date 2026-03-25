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

function mockError(status: number, body: string) {
  fetchMock.mockResolvedValueOnce({
    ok: false,
    status,
    text: async () => body,
  });
}

const adapter = new ActivepiecesAdapter('http://engine:8080', 'test-key');

beforeEach(() => fetchMock.mockReset());

// ─── triggerFlow ──────────────────────────────────────────────────────────────

describe('triggerFlow', () => {
  it('devuelve runId del engine', async () => {
    mockOk({ id: 'run-123', status: 'RUNNING', startTime: '2024-01-01T00:00:00Z' });
    const result = await adapter.triggerFlow({ flowId: 'flow-abc', tenantId: 'tenant-1', payload: {} });
    expect(result.runId).toBe('run-123');
  });

  it('lanza IntegrationEngineError en error HTTP', async () => {
    mockError(422, 'Flow not found');
    await expect(
      adapter.triggerFlow({ flowId: 'bad', tenantId: 'tenant-1', payload: {} }),
    ).rejects.toThrow(IntegrationEngineError);
  });
});

// ─── IdMapper ─────────────────────────────────────────────────────────────────

describe('IdMapper', () => {
  it('aplica el mapper de flowId al trigger', async () => {
    const mapped = new ActivepiecesAdapter('http://engine:8080', 'key', {
      flowId: (_tenant, id) => `external-${id}`,
      tenantRef: (tenant) => `proj-${tenant}`,
    });

    mockOk({ id: 'run-1', status: 'RUNNING', startTime: '2024-01-01T00:00:00Z' });
    await mapped.triggerFlow({ flowId: 'my-flow', tenantId: 'tenant-1', payload: {} });

    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body);
    expect(body.flowVersionId).toBe('external-my-flow');
    expect(body.tenantRef).toBe('proj-tenant-1');
  });

  it('passthrough por defecto cuando no hay mapper', async () => {
    mockOk({ id: 'run-2', status: 'RUNNING', startTime: '2024-01-01T00:00:00Z' });
    await adapter.triggerFlow({ flowId: 'flow-x', tenantId: 'ten-y', payload: {} });

    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body);
    expect(body.flowVersionId).toBe('flow-x');
    expect(body.tenantRef).toBe('ten-y');
  });
});

// ─── getRunStatus + output contract ──────────────────────────────────────────

describe('getRunStatus', () => {
  it.each([
    ['RUNNING', 'running'],
    ['SUCCEEDED', 'succeeded'],
    ['FAILED', 'failed'],
    ['PAUSED', 'paused'],
    ['STOPPED', 'failed'],
    ['TIMEOUT', 'failed'],
  ])('mapea status %s → %s', async (engineStatus, expected) => {
    mockOk({ id: 'run-x', status: engineStatus, startTime: '2024-01-01T00:00:00Z' });
    const run = await adapter.getRunStatus('tenant-1', 'run-x');
    expect(run.status).toBe(expected);
  });

  it('extrae output.result del último task', async () => {
    mockOk({
      id: 'run-1', status: 'SUCCEEDED', startTime: '2024-01-01T00:00:00Z',
      tasks: [
        { output: { intermediate: true } },
        { output: { finalResult: 42 } },
      ],
    });
    const run = await adapter.getRunStatus('tenant-1', 'run-1');
    expect(run.output?.result).toEqual({ finalResult: 42 });
    expect(run.output?.error).toBeUndefined();
  });

  it('lanza 403 si el tenantRef del run no coincide con el tenant', async () => {
    mockOk({ id: 'run-x', tenantRef: 'proj-otro-tenant', status: 'SUCCEEDED', startTime: '2024-01-01T00:00:00Z' });
    const mapped = new ActivepiecesAdapter('http://engine:8080', 'key', {
      tenantRef: (t) => `proj-${t}`,
    });
    await expect(mapped.getRunStatus('tenant-1', 'run-x')).rejects.toThrow(IntegrationEngineError);
  });

  it('no lanza si el engine no devuelve tenantRef (campo ausente)', async () => {
    mockOk({ id: 'run-y', status: 'SUCCEEDED', startTime: '2024-01-01T00:00:00Z' });
    const run = await adapter.getRunStatus('tenant-1', 'run-y');
    expect(run.runId).toBe('run-y');
  });

  it('output es undefined cuando no hay tasks', async () => {
    mockOk({ id: 'run-2', status: 'FAILED', startTime: '2024-01-01T00:00:00Z' });
    const run = await adapter.getRunStatus('tenant-1', 'run-2');
    expect(run.output).toBeUndefined();
  });

  it('captura error del último task en output.error', async () => {
    mockOk({
      id: 'run-3', status: 'FAILED', startTime: '2024-01-01T00:00:00Z',
      tasks: [{ output: undefined, error: 'Connection timeout' }],
    });
    const run = await adapter.getRunStatus('tenant-1', 'run-3');
    expect(run.output?.error).toBe('Connection timeout');
  });
});

// ─── cancelRun ────────────────────────────────────────────────────────────────

describe('cancelRun', () => {
  it('llama a POST stop con el runId y tenantRef correctos', async () => {
    mockOk({});
    await adapter.cancelRun('tenant-1', 'run-abc');

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain('/v1/flow-runs/run-abc/requests/stop');
    expect(url).toContain('tenantRef=tenant-1');
    expect(init.method).toBe('POST');
  });

  it('aplica el mapper de tenantRef en cancelRun', async () => {
    const mapped = new ActivepiecesAdapter('http://engine:8080', 'key', {
      tenantRef: (t) => `proj-${t}`,
    });
    mockOk({});
    await mapped.cancelRun('tenant-1', 'run-xyz');

    const [url] = fetchMock.mock.calls[0];
    expect(url).toContain('tenantRef=proj-tenant-1');
  });
});

// ─── listFlows ────────────────────────────────────────────────────────────────

describe('listFlows', () => {
  it('mapea flows correctamente', async () => {
    mockOk({
      data: [
        { id: 'f-1', status: 'ENABLED', version: { displayName: 'Flow A' } },
        { id: 'f-2', status: 'DISABLED', version: { displayName: 'Flow B' } },
      ],
    });

    const flows = await adapter.listFlows('tenant-1');
    expect(flows[0]).toEqual({ id: 'f-1', name: 'Flow A', tenantId: 'tenant-1', enabled: true });
    expect(flows[1].enabled).toBe(false);
  });

  it('pagina correctamente con cursor', async () => {
    mockOk({ data: [{ id: 'f-1', status: 'ENABLED', version: { displayName: 'F1' } }], next: 'cur-abc' });
    mockOk({ data: [{ id: 'f-2', status: 'ENABLED', version: { displayName: 'F2' } }] });

    const flows = await adapter.listFlows('tenant-1');
    expect(flows).toHaveLength(2);
    const secondUrl: string = fetchMock.mock.calls[1][0];
    expect(secondUrl).toContain('cursor=cur-abc');
  });
});

// ─── enableFlow / disableFlow ─────────────────────────────────────────────────

describe('enableFlow / disableFlow', () => {
  it('enableFlow hace PATCH con ENABLED', async () => {
    mockOk({});
    await adapter.enableFlow('tenant-1', 'f-1');
    const [, init] = fetchMock.mock.calls[0];
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body)).toEqual({ status: 'ENABLED' });
  });

  it('disableFlow hace PATCH con DISABLED', async () => {
    mockOk({});
    await adapter.disableFlow('tenant-1', 'f-1');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ status: 'DISABLED' });
  });
});

// ─── createEngine factory ─────────────────────────────────────────────────────

describe('createEngine factory', () => {
  it('lanza si INTEGRATION_ENGINE_URL no está definida', async () => {
    delete process.env.INTEGRATION_ENGINE_URL;
    delete process.env.INTEGRATION_ENGINE_API_KEY;
    const { createEngine } = await import('../index.js');
    expect(() => createEngine()).toThrow('INTEGRATION_ENGINE_URL is required');
  });

  it('lanza si INTEGRATION_ENGINE_API_KEY no está definida', async () => {
    process.env.INTEGRATION_ENGINE_URL = 'http://engine:8080';
    delete process.env.INTEGRATION_ENGINE_API_KEY;
    const { createEngine } = await import('../index.js');
    expect(() => createEngine()).toThrow('INTEGRATION_ENGINE_API_KEY is required');
    delete process.env.INTEGRATION_ENGINE_URL;
  });
});
