import { beforeEach, describe, expect, it, vi } from 'vitest';

const compareMock = vi.fn();
const bridgeCtorMock = vi.fn();
const fetchMock = vi.fn();

vi.mock('@integrax/schema-bridge', () => ({
  SchemaBridge: class {
    constructor(config?: unknown) {
      bridgeCtorMock(config);
    }

    compare = compareMock;
  },
}));

vi.mock('@activepieces/pieces-framework', () => ({
  createAction: (config: unknown) => config,
  createPiece: (config: unknown) => config,
  Property: {
    ShortText: (config: unknown) => ({ type: 'short_text', ...config }),
    Json: (config: unknown) => ({ type: 'json', ...config }),
    Checkbox: (config: unknown) => ({ type: 'checkbox', ...config }),
    Number: (config: unknown) => ({ type: 'number', ...config }),
  },
}));

vi.stubGlobal('fetch', fetchMock);

import { runCompareSchemas, buildCompareSchemasPieceAction } from '../actions/compare-schemas.js';
import { runRecordFeedback, buildRecordFeedbackPieceAction } from '../actions/record-feedback.js';
import { runGetMemory, buildGetMemoryPieceAction } from '../actions/get-memory.js';
import { registerSchemaBridgePiece } from '../index.js';

type Scenario = {
  key: string;
  connectorAId: string;
  connectorBId: string;
  samplesA: Record<string, unknown>[];
  samplesB: Record<string, unknown>[];
};

type Profile = {
  key: string;
  enableLlmEscalation?: boolean;
  renameSimilarityThreshold?: number;
  mappingMemory?: Array<{
    sourcePath: string;
    targetPath: string;
    acceptedCount: number;
    rejectedCount: number;
    averageConfidence: number;
    lastAcceptedAt?: string;
  }>;
};

function report(id: string) {
  return {
    id,
    connectorAId: 'a',
    connectorBId: 'b',
    inferredSchemaA: { fields: [], fingerprint: 'a', sampleCount: 1 },
    inferredSchemaB: { fields: [], fingerprint: 'b', sampleCount: 1 },
    diffs: [],
    mappings: [],
    resolvedConflicts: [],
    requirementsReport: {
      breaking: [],
      nonBreaking: [],
      informational: [],
      llmEscalations: [],
      summary: {
        totalDiffs: 0,
        breakingCount: 0,
        nonBreakingCount: 0,
        informationalCount: 0,
        llmEscalationCount: 0,
        resolvedDeterministically: 0,
        resolvedByHeuristic: 0,
        coveragePercent: 100,
      },
    },
    generatedTransformTs: '',
    generatedAt: '2026-04-01T00:00:00.000Z',
  };
}

function mockOk(body: unknown) {
  fetchMock.mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: async () => body,
    text: async () => JSON.stringify(body),
  });
}

function mockError(status: number, text: string) {
  fetchMock.mockResolvedValueOnce({
    ok: false,
    status,
    text: async () => text,
  });
}

function pad(value: number) {
  return String(value).padStart(3, '0');
}

const memoryFixture = [
  {
    sourcePath: 'monto',
    targetPath: 'amount',
    acceptedCount: 4,
    rejectedCount: 0,
    averageConfidence: 0.94,
    lastAcceptedAt: '2026-03-30T10:00:00.000Z',
  },
];

const scenarios: Scenario[] = [
  {
    key: 'mercadopago-billing',
    connectorAId: 'mercadopago',
    connectorBId: 'billing-latam',
    samplesA: [
      { id: 'PAY-1001', monto: '15000,50', moneda: 'ARS', estado: 'approved' },
      { id: 'PAY-1002', monto: '22000,00', moneda: 'ARS', estado: 'pending' },
    ],
    samplesB: [
      { payment_id: 'PAY-1001', amount: '15000.50', currency: 'ARS', status: 'approved' },
      { payment_id: 'PAY-1002', amount: '22000.00', currency: 'ARS', status: 'pending' },
    ],
  },
  {
    key: 'afip-invoice',
    connectorAId: 'afip-wsfe',
    connectorBId: 'invoice-system',
    samplesA: [
      { nro_comprobante: 'FC-A-00001-00000001', cuit_receptor: '30-11223344-5' },
      { nro_comprobante: 'FC-A-00001-00000002', cuit_receptor: '20-12345678-9' },
    ],
    samplesB: [
      { invoice_number: 'FC-A-00001-00000001', tax_id: '30-11223344-5' },
      { invoice_number: 'FC-A-00001-00000002', tax_id: '20-12345678-9' },
    ],
  },
  {
    key: 'tango-contabilium',
    connectorAId: 'tango',
    connectorBId: 'contabilium',
    samplesA: [
      { cod_cliente: 'CLI-001', cuit: '30-12345678-9', ciudad: 'Buenos Aires' },
      { cod_cliente: 'CLI-002', cuit: '30-87654321-0', ciudad: 'Cordoba' },
    ],
    samplesB: [
      { cliente_id: 'CLI-001', numero_cuit: '30-12345678-9', localidad: 'Buenos Aires' },
      { cliente_id: 'CLI-002', numero_cuit: '30-87654321-0', localidad: 'Cordoba' },
    ],
  },
  {
    key: 'oracle-sap',
    connectorAId: 'oracle-ebs',
    connectorBId: 'sap-s4',
    samplesA: [
      { po_number: 'PO-2024-001', vendor_id: 'PROV-100', line_amount: '15000,50' },
      { po_number: 'PO-2024-002', vendor_id: 'PROV-200', line_amount: '8750,75' },
    ],
    samplesB: [
      { EBELN: 'PO-2024-001', LIFNR: 'PROV-100', NETWR: '15000.50' },
      { EBELN: 'PO-2024-002', LIFNR: 'PROV-200', NETWR: '8750.75' },
    ],
  },
  {
    key: 'multi-currency',
    connectorAId: 'latam-source',
    connectorBId: 'latam-target',
    samplesA: [
      { txn_ref: 'T-001', moneda: 'ARS', monto: '15000,00', pais: 'ARG' },
      { txn_ref: 'T-002', moneda: 'BRL', monto: '3200,50', pais: 'BRA' },
    ],
    samplesB: [
      { transaction_id: 'T-001', currency: 'ARS', amount: '15000.00', country: 'ARG' },
      { transaction_id: 'T-002', currency: 'BRL', amount: '3200.50', country: 'BRA' },
    ],
  },
  {
    key: 'softland-quickbooks',
    connectorAId: 'softland',
    connectorBId: 'quickbooks',
    samplesA: [
      { folio: 'F-10001', rut_cliente: '76.123.456-7', neto: '120000,00' },
      { folio: 'F-10002', rut_cliente: '12.345.678-9', neto: '85000,50' },
    ],
    samplesB: [
      { DocNumber: 'F-10001', CustomerRef: '76.123.456-7', Subtotal: '120000.00' },
      { DocNumber: 'F-10002', CustomerRef: '12.345.678-9', Subtotal: '85000.50' },
    ],
  },
  {
    key: 'sparse-nulls',
    connectorAId: 'sparse-a',
    connectorBId: 'sparse-b',
    samplesA: Array.from({ length: 4 }, (_, index) => ({
      legacy_customer_id: index < 2 ? `LEG-${pad(index + 1)}` : null,
      note: index < 3 ? 'N/A' : `manual-${index}`,
      comments: null,
    })),
    samplesB: Array.from({ length: 4 }, (_, index) => ({
      customerId: index < 2 ? `LEG-${pad(index + 1)}` : null,
      comment: index < 3 ? 'N/A' : `manual-${index}`,
      remarks: null,
    })),
  },
  {
    key: 'placeholder-swamping',
    connectorAId: 'placeholder-a',
    connectorBId: 'placeholder-b',
    samplesA: Array.from({ length: 4 }, (_, index) => ({
      order_ref: `ORD-${pad(index + 1)}`,
      note: 'N/A',
      comment: index % 2 === 0 ? 'TBD' : '-',
    })),
    samplesB: Array.from({ length: 4 }, (_, index) => ({
      orderId: `ORD-${pad(index + 1)}`,
      internalNote: 'N/A',
      freeText: index % 2 === 0 ? 'TBD' : '-',
    })),
  },
  {
    key: 'zero-overlap',
    connectorAId: 'zero-overlap-a',
    connectorBId: 'zero-overlap-b',
    samplesA: Array.from({ length: 4 }, (_, index) => ({
      legacy_customer_id: `CUST-A-${pad(index + 1)}`,
      tenant_code: `TENANT-${(index % 2) + 1}`,
    })),
    samplesB: Array.from({ length: 4 }, (_, index) => ({
      customerId: `CUST-B-${pad(index + 51)}`,
      tenantId: `TENANT-${(index % 2) + 1}`,
    })),
  },
  {
    key: 'uuid-triplets',
    connectorAId: 'uuid-a',
    connectorBId: 'uuid-b',
    samplesA: Array.from({ length: 3 }, (_, index) => ({
      buyer_uuid: `550e8400-e29b-41d4-a716-44665544000${index}`,
      seller_uuid: `660e8400-e29b-41d4-a716-44665544000${index}`,
      tenant_uuid: `770e8400-e29b-41d4-a716-44665544000${index}`,
    })),
    samplesB: Array.from({ length: 3 }, (_, index) => ({
      buyerId: `550e8400-e29b-41d4-a716-44665544000${index}`,
      sellerId: `660e8400-e29b-41d4-a716-44665544000${index}`,
      tenantId: `770e8400-e29b-41d4-a716-44665544000${index}`,
    })),
  },
  {
    key: 'flattened-vs-nested',
    connectorAId: 'flat-a',
    connectorBId: 'nested-b',
    samplesA: [
      { order_lines: [{ sku_code: 'SKU-100', component_code: 'CMP-100' }] },
      { order_lines: [{ sku_code: 'SKU-200', component_code: 'CMP-200' }] },
    ],
    samplesB: [
      { order: { lines: [{ sku: 'SKU-100', components: [{ id: 'CMP-100' }] }] } },
      { order: { lines: [{ sku: 'SKU-200', components: [{ id: 'CMP-200' }] }] } },
    ],
  },
  {
    key: 'mixed-type-noise',
    connectorAId: 'mixed-a',
    connectorBId: 'mixed-b',
    samplesA: [
      { order_total: '100.50', order_status: 'approved', quality_flag: 1 },
      { order_total: 101.5, order_status: 'pending', quality_flag: '1' },
    ],
    samplesB: [
      { amount: 100.5, status: 'approved', confidenceFlag: true },
      { amount: 101.5, status: 'pending', confidenceFlag: true },
    ],
  },
  {
    key: 'low-entropy-collision',
    connectorAId: 'low-entropy-a',
    connectorBId: 'low-entropy-b',
    samplesA: Array.from({ length: 4 }, (_, index) => ({
      lifecycle_status: index % 2 === 0 ? 'ACTIVE' : 'INACTIVE',
      support_comment: index % 2 === 0 ? 'N/A' : 'ACTIVE',
      record_id: `REC-${pad(index + 1)}`,
    })),
    samplesB: Array.from({ length: 4 }, (_, index) => ({
      state: index % 2 === 0 ? 'ACTIVE' : 'INACTIVE',
      note: index % 2 === 0 ? 'N/A' : 'ACTIVE',
      recordId: `REC-${pad(index + 1)}`,
    })),
  },
];

const profiles: Profile[] = [
  {
    key: 'default-options',
  },
  {
    key: 'memory-injected',
    enableLlmEscalation: false,
    renameSimilarityThreshold: 0.7,
    mappingMemory: memoryFixture,
  },
  {
    key: 'llm-enabled',
    enableLlmEscalation: true,
    renameSimilarityThreshold: 0.83,
    mappingMemory: memoryFixture,
  },
];

beforeEach(() => {
  compareMock.mockReset();
  bridgeCtorMock.mockReset();
  fetchMock.mockReset();
  vi.restoreAllMocks();
});

describe('runCompareSchemas', () => {
  describe.each(scenarios)('$key', scenario => {
    describe.each(profiles)('$key', profile => {
      it('forwards scenario data and options to the bridge', async () => {
        compareMock.mockResolvedValue(report(`${scenario.key}-${profile.key}`));

        const result = await runCompareSchemas({
          connectorAId: scenario.connectorAId,
          connectorBId: scenario.connectorBId,
          tenantId: 'tenant-1',
          samplesA: scenario.samplesA,
          samplesB: scenario.samplesB,
          anthropicApiKey: 'sk-test',
          enableLlmEscalation: profile.enableLlmEscalation,
          renameSimilarityThreshold: profile.renameSimilarityThreshold,
          mappingMemory: profile.mappingMemory,
        });

        expect(result.id).toBe(`${scenario.key}-${profile.key}`);
        expect(compareMock).toHaveBeenCalledTimes(1);
        expect(compareMock).toHaveBeenCalledWith({
          connectorAId: scenario.connectorAId,
          connectorBId: scenario.connectorBId,
          tenantId: 'tenant-1',
          samplesA: scenario.samplesA,
          samplesB: scenario.samplesB,
          mappingMemory: profile.mappingMemory,
          options: {
            enableLlmEscalation: profile.enableLlmEscalation ?? false,
            renameSimilarityThreshold: profile.renameSimilarityThreshold ?? 0.7,
            maxLlmEscalations: 3,
          },
        });
        expect(bridgeCtorMock).toHaveBeenCalledWith({
          anthropicApiKey: profile.enableLlmEscalation ? 'sk-test' : undefined,
        });
      });
    });
  });

  it('propagates bridge.compare errors', async () => {
    compareMock.mockRejectedValueOnce(new Error('bridge exploded'));

    await expect(runCompareSchemas({
      connectorAId: 'mp',
      connectorBId: 'cl',
      tenantId: 'tenant-1',
      samplesA: [{ id: '1' }],
      samplesB: [{ id: '1' }],
    })).rejects.toThrow('bridge exploded');
  });

  it('defaults renameSimilarityThreshold to 0.7 when omitted', async () => {
    compareMock.mockResolvedValue(report('br-default-threshold'));

    await runCompareSchemas({
      connectorAId: 'mp',
      connectorBId: 'cl',
      tenantId: 'tenant-1',
      samplesA: [{ id: '1' }],
      samplesB: [{ id: '1' }],
    });

    expect(compareMock.mock.calls[0][0].options.renameSimilarityThreshold).toBe(0.7);
  });
});

describe('runRecordFeedback', () => {
  it('posts the expected payload for accepted feedback', async () => {
    mockOk({ success: true, data: { accepted: true } });

    const result = await runRecordFeedback({
      controlPlaneUrl: 'http://cp:3000',
      apiKey: 'ixk_test',
      reportId: 'br_01',
      sourcePath: 'total',
      targetPath: 'monto_total',
      accepted: true,
      confidence: 0.92,
    });

    expect(result).toEqual({ accepted: true });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://cp:3000/api/schemas/reports/br_01/feedback');
    expect(init).toMatchObject({
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'ApiKey ixk_test',
      },
    });
    expect(JSON.parse(init.body)).toEqual({
      sourcePath: 'total',
      targetPath: 'monto_total',
      accepted: true,
      confidence: 0.92,
    });
  });

  it('supports rejected feedback payloads', async () => {
    mockOk({ success: true, data: { accepted: false } });

    const result = await runRecordFeedback({
      controlPlaneUrl: 'http://cp:3000',
      apiKey: 'ixk_test',
      reportId: 'br_02',
      sourcePath: 'estado',
      targetPath: 'status',
      accepted: false,
      confidence: 0.31,
    });

    expect(result).toEqual({ accepted: false });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      sourcePath: 'estado',
      targetPath: 'status',
      accepted: false,
      confidence: 0.31,
    });
  });

  it('throws a helpful error when the API returns 404', async () => {
    mockError(404, 'Report not found');

    await expect(runRecordFeedback({
      controlPlaneUrl: 'http://cp:3000',
      apiKey: 'ixk_test',
      reportId: 'missing',
      sourcePath: 'a',
      targetPath: 'b',
      accepted: true,
      confidence: 0.8,
    })).rejects.toThrow('recordFeedback failed 404: Report not found');
  });

  it('throws a helpful error when the API returns 500', async () => {
    mockError(500, 'DB offline');

    await expect(runRecordFeedback({
      controlPlaneUrl: 'http://cp:3000',
      apiKey: 'ixk_test',
      reportId: 'br_03',
      sourcePath: 'a',
      targetPath: 'b',
      accepted: true,
      confidence: 0.8,
    })).rejects.toThrow('recordFeedback failed 500: DB offline');
  });

  it('fails fast if the API payload shape is invalid', async () => {
    mockOk({ success: true, data: null });

    await expect(runRecordFeedback({
      controlPlaneUrl: 'http://cp:3000',
      apiKey: 'ixk_test',
      reportId: 'br_04',
      sourcePath: 'a',
      targetPath: 'b',
      accepted: true,
      confidence: 0.8,
    })).rejects.toThrow();
  });
});

describe('runGetMemory', () => {
  it('returns memory entries and sends the expected headers', async () => {
    mockOk({
      success: true,
      data: [{
        sourcePath: 'total',
        targetPath: 'monto_total',
        acceptedCount: 3,
        rejectedCount: 0,
        averageConfidence: 0.9,
        lastAcceptedAt: '2026-03-31T10:00:00.000Z',
      }],
    });

    const entries = await runGetMemory({
      controlPlaneUrl: 'http://cp:3000',
      apiKey: 'ixk_test',
      tenantId: 'tenant-1',
      connectorAId: 'mercadopago',
      connectorBId: 'contabilium',
    });

    expect(entries).toEqual([{
      sourcePath: 'total',
      targetPath: 'monto_total',
      acceptedCount: 3,
      rejectedCount: 0,
      averageConfidence: 0.9,
      lastAcceptedAt: '2026-03-31T10:00:00.000Z',
    }]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain('/api/schemas/memory');
    expect(url).toContain('connectorAId=mercadopago');
    expect(url).toContain('connectorBId=contabilium');
    expect(init).toEqual({
      headers: {
        Authorization: 'ApiKey ixk_test',
        'X-Tenant-Id': 'tenant-1',
      },
    });
  });

  it('preserves URL encoding for connector identifiers', async () => {
    mockOk({ success: true, data: [] });

    await runGetMemory({
      controlPlaneUrl: 'http://cp:3000',
      apiKey: 'ixk_test',
      tenantId: 'tenant-1',
      connectorAId: 'oracle ebs',
      connectorBId: 'sap/s4',
    });

    const [url] = fetchMock.mock.calls[0];
    expect(url).toContain('connectorAId=oracle+ebs');
    expect(url).toContain('connectorBId=sap%2Fs4');
  });

  it('returns an empty array when no memory exists', async () => {
    mockOk({ success: true, data: [] });

    await expect(runGetMemory({
      controlPlaneUrl: 'http://cp:3000',
      apiKey: 'ixk_test',
      tenantId: 'tenant-1',
      connectorAId: 'mp',
      connectorBId: 'cl',
    })).resolves.toEqual([]);
  });

  it('throws a helpful error when the API returns 401', async () => {
    mockError(401, 'Unauthorized');

    await expect(runGetMemory({
      controlPlaneUrl: 'http://cp:3000',
      apiKey: 'ixk_test',
      tenantId: 'tenant-1',
      connectorAId: 'mp',
      connectorBId: 'cl',
    })).rejects.toThrow('getMemory failed 401: Unauthorized');
  });

  it('throws a helpful error when the API returns 500', async () => {
    mockError(500, 'Storage unavailable');

    await expect(runGetMemory({
      controlPlaneUrl: 'http://cp:3000',
      apiKey: 'ixk_test',
      tenantId: 'tenant-1',
      connectorAId: 'mp',
      connectorBId: 'cl',
    })).rejects.toThrow('getMemory failed 500: Storage unavailable');
  });

  it('fails fast if the payload shape is invalid', async () => {
    mockOk({ success: true, data: null });

    await expect(runGetMemory({
      controlPlaneUrl: 'http://cp:3000',
      apiKey: 'ixk_test',
      tenantId: 'tenant-1',
      connectorAId: 'mp',
      connectorBId: 'cl',
    })).rejects.toThrow();
  });
});

describe('buildCompareSchemasPieceAction', () => {
  it('builds the compare action metadata', async () => {
    const action = await buildCompareSchemasPieceAction();

    expect(action).toMatchObject({
      name: 'compare_schemas',
      displayName: 'Compare Schemas',
    });
    expect(action.props.connectorAId.type).toBe('short_text');
    expect(action.props.connectorBId.type).toBe('short_text');
    expect(action.props.samplesA.type).toBe('json');
    expect(action.props.samplesB.type).toBe('json');
    expect(action.props.enableLlmEscalation.type).toBe('checkbox');
  });

  it('hydrates memory and passes auth-derived tenant to compare', async () => {
    mockOk({ success: true, data: memoryFixture });
    compareMock.mockResolvedValue(report('br_action_compare'));
    const action = await buildCompareSchemasPieceAction();

    const result = await action.run({
      auth: {
        controlPlaneUrl: 'http://cp:3000',
        apiKey: 'ixk_test',
        tenantRef: 'tenant-77',
      },
      propsValue: {
        connectorAId: 'mercadopago',
        connectorBId: 'contabilium',
        samplesA: scenarios[0].samplesA,
        samplesB: scenarios[0].samplesB,
        enableLlmEscalation: true,
      },
    });

    expect(result.id).toBe('br_action_compare');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(compareMock).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: 'tenant-77',
      mappingMemory: memoryFixture,
      options: expect.objectContaining({
        enableLlmEscalation: true,
        renameSimilarityThreshold: 0.7,
      }),
    }));
  });

  it('continues without memory when the control plane call fails', async () => {
    mockError(503, 'Control plane unavailable');
    compareMock.mockResolvedValue(report('br_without_memory'));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const action = await buildCompareSchemasPieceAction();

    const result = await action.run({
      auth: {
        controlPlaneUrl: 'http://cp:3000',
        apiKey: 'ixk_test',
        tenantRef: 'tenant-88',
      },
      propsValue: {
        connectorAId: 'mercadopago',
        connectorBId: 'contabilium',
        samplesA: scenarios[1].samplesA,
        samplesB: scenarios[1].samplesB,
      },
    });

    expect(result.id).toBe('br_without_memory');
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(compareMock).toHaveBeenCalledWith(expect.objectContaining({
      mappingMemory: [],
    }));
  });

  it('defaults enableLlmEscalation to false when the prop is omitted', async () => {
    mockOk({ success: true, data: [] });
    compareMock.mockResolvedValue(report('br_default_llm'));
    const action = await buildCompareSchemasPieceAction();

    await action.run({
      auth: {
        controlPlaneUrl: 'http://cp:3000',
        apiKey: 'ixk_test',
        tenantRef: 'tenant-99',
      },
      propsValue: {
        connectorAId: 'a',
        connectorBId: 'b',
        samplesA: [{ id: '1' }],
        samplesB: [{ id: '1' }],
      },
    });

    expect(compareMock).toHaveBeenCalledWith(expect.objectContaining({
      options: expect.objectContaining({
        enableLlmEscalation: false,
      }),
    }));
  });
});

describe('buildRecordFeedbackPieceAction', () => {
  it('builds the record feedback action metadata', async () => {
    const action = await buildRecordFeedbackPieceAction();

    expect(action).toMatchObject({
      name: 'record_feedback',
      displayName: 'Record Mapping Feedback',
    });
    expect(action.props.reportId.type).toBe('short_text');
    expect(action.props.confidence.type).toBe('number');
  });

  it('uses auth and props to persist feedback', async () => {
    mockOk({ success: true, data: { accepted: true } });
    const action = await buildRecordFeedbackPieceAction();

    const result = await action.run({
      auth: {
        controlPlaneUrl: 'http://cp:3000',
        apiKey: 'ixk_test',
      },
      propsValue: {
        reportId: 'br_01',
        sourcePath: 'monto',
        targetPath: 'amount',
        accepted: true,
        confidence: 0.91,
      },
    });

    expect(result).toEqual({ accepted: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('returns rejected responses unchanged from the API payload', async () => {
    mockOk({ success: true, data: { accepted: false } });
    const action = await buildRecordFeedbackPieceAction();

    await expect(action.run({
      auth: {
        controlPlaneUrl: 'http://cp:3000',
        apiKey: 'ixk_test',
      },
      propsValue: {
        reportId: 'br_02',
        sourcePath: 'estado',
        targetPath: 'status',
        accepted: false,
        confidence: 0.2,
      },
    })).resolves.toEqual({ accepted: false });
  });
});

describe('buildGetMemoryPieceAction', () => {
  it('builds the get memory action metadata', async () => {
    const action = await buildGetMemoryPieceAction();

    expect(action).toMatchObject({
      name: 'get_mapping_memory',
      displayName: 'Get Mapping Memory',
    });
    expect(action.props.connectorAId.type).toBe('short_text');
    expect(action.props.connectorBId.type).toBe('short_text');
  });

  it('uses auth and props to load memory entries', async () => {
    mockOk({ success: true, data: memoryFixture });
    const action = await buildGetMemoryPieceAction();

    const result = await action.run({
      auth: {
        controlPlaneUrl: 'http://cp:3000',
        apiKey: 'ixk_test',
        tenantRef: 'tenant-1',
      },
      propsValue: {
        connectorAId: 'mercadopago',
        connectorBId: 'contabilium',
      },
    });

    expect(result).toEqual(memoryFixture);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('propagates getMemory failures from the action run method', async () => {
    mockError(500, 'Cache miss');
    const action = await buildGetMemoryPieceAction();

    await expect(action.run({
      auth: {
        controlPlaneUrl: 'http://cp:3000',
        apiKey: 'ixk_test',
        tenantRef: 'tenant-1',
      },
      propsValue: {
        connectorAId: 'mercadopago',
        connectorBId: 'contabilium',
      },
    })).rejects.toThrow('getMemory failed 500: Cache miss');
  });
});

describe('registerSchemaBridgePiece', () => {
  it('registers the piece metadata', async () => {
    const piece = await registerSchemaBridgePiece();

    expect(piece).toMatchObject({
      displayName: 'Schema Bridge',
      minimumSupportedRelease: '0.20.0',
      logoUrl: 'https://raw.githubusercontent.com/integrax/assets/main/schema-bridge-logo.png',
    });
  });

  it('registers the three expected actions', async () => {
    const piece = await registerSchemaBridgePiece();

    expect(piece.actions).toHaveLength(3);
    expect(piece.actions.map((action: { name: string }) => action.name)).toEqual([
      'compare_schemas',
      'record_feedback',
      'get_mapping_memory',
    ]);
  });

  it('registers an action list with no triggers by default', async () => {
    const piece = await registerSchemaBridgePiece();

    expect(piece.triggers).toEqual([]);
    expect(piece.categories).toEqual([]);
  });
});
