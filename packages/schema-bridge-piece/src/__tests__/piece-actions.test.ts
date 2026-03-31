import { describe, it, expect, vi, beforeEach } from 'vitest';

const compareMock = vi.fn();

vi.mock('@integrax/schema-bridge', () => ({
  SchemaBridge: class {
    compare = compareMock;
  },
}));

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

function mockOk(body: unknown) {
  fetchMock.mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: async () => body,
    text: async () => JSON.stringify(body),
  });
}

function mockError(status: number, text: string) {
  fetchMock.mockResolvedValueOnce({ ok: false, status, text: async () => text });
}

import { runCompareSchemas } from '../actions/compare-schemas.js';
import { runRecordFeedback } from '../actions/record-feedback.js';
import { runGetMemory } from '../actions/get-memory.js';

beforeEach(() => {
  compareMock.mockReset();
  fetchMock.mockReset();
});

describe('runCompareSchemas', () => {
  it('llama a bridge.compare() con los parámetros correctos', async () => {
    compareMock.mockResolvedValue({ id: 'br_01', diffs: [], mappings: [], generatedTransformTs: '', requirementsReport: { summary: { coveragePercent: 100 } } });

    const result = await runCompareSchemas({
      connectorAId: 'mp', connectorBId: 'cl', tenantId: 'tenant-1',
      samplesA: [{ id: '1', amount: 100 }],
      samplesB: [{ id: '1', monto: 100 }],
    });

    expect(compareMock).toHaveBeenCalledWith(expect.objectContaining({
      connectorAId: 'mp', connectorBId: 'cl', tenantId: 'tenant-1',
    }));
    expect(result.id).toBe('br_01');
  });

  it('no pasa apiKey al bridge si enableLlmEscalation es false', async () => {
    compareMock.mockResolvedValue({ id: 'br_02', diffs: [], mappings: [], generatedTransformTs: '', requirementsReport: { summary: {} } });
    await runCompareSchemas({
      connectorAId: 'mp', connectorBId: 'cl', tenantId: 'tenant-1',
      samplesA: [{ x: 1 }], samplesB: [{ x: 1 }],
      enableLlmEscalation: false, anthropicApiKey: 'sk-ignored',
    });
    expect(compareMock).toHaveBeenCalledTimes(1);
  });
});

describe('runRecordFeedback', () => {
  it('llama a POST feedback con body correcto', async () => {
    mockOk({ success: true, data: { accepted: true } });

    const result = await runRecordFeedback({
      controlPlaneUrl: 'http://cp:3000', apiKey: 'ixk_test',
      reportId: 'br_01', sourcePath: 'total', targetPath: 'monto_total',
      accepted: true, confidence: 0.92,
    });

    expect(result.accepted).toBe(true);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain('/api/schemas/reports/br_01/feedback');
    expect(JSON.parse(init.body)).toEqual({ sourcePath: 'total', targetPath: 'monto_total', accepted: true, confidence: 0.92 });
  });

  it('lanza si la API devuelve 404', async () => {
    mockError(404, 'Report not found');
    await expect(runRecordFeedback({
      controlPlaneUrl: 'http://cp:3000', apiKey: 'ixk_test',
      reportId: 'bad', sourcePath: 'a', targetPath: 'b', accepted: true, confidence: 0.8,
    })).rejects.toThrow('recordFeedback failed 404');
  });
});

describe('runGetMemory', () => {
  it('devuelve las entradas de memoria con query params correctos', async () => {
    mockOk({ success: true, data: [{ sourcePath: 'total', targetPath: 'monto_total', acceptedCount: 3, rejectedCount: 0, averageConfidence: 0.9 }] });

    const entries = await runGetMemory({
      controlPlaneUrl: 'http://cp:3000', apiKey: 'ixk_test', tenantId: 'tenant-1',
      connectorAId: 'mercadopago', connectorBId: 'contabilium',
    });

    expect(entries).toHaveLength(1);
    const [url] = fetchMock.mock.calls[0];
    expect(url).toContain('connectorAId=mercadopago');
    expect(url).toContain('connectorBId=contabilium');
  });

  it('devuelve array vacío si no hay memoria', async () => {
    mockOk({ success: true, data: [] });
    expect(await runGetMemory({
      controlPlaneUrl: 'http://cp:3000', apiKey: 'ixk_test', tenantId: 'tenant-1',
      connectorAId: 'mp', connectorBId: 'cl',
    })).toEqual([]);
  });
});
