import express from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

// ─── Mock stateful de Temporal ────────────────────────────────────────────────
const { queryMock, loadMappingMemoryMock, upsertEntryMock, temporalState } = vi.hoisted(() => ({
  queryMock: vi.fn(),
  loadMappingMemoryMock: vi.fn(),
  upsertEntryMock: vi.fn(),
  temporalState: { connectShouldFail: false },
}));

vi.mock('../middleware/auth.js', () => ({
  requireAuth: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    req.user = {
      id: 'user-1',
      email: 'ops@test.com',
      role: 'tenant_admin',
      tenantId: 'tenant-1',
    };
    req.tenantId = 'tenant-1';
    next();
  },
  requireTenant: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    req.tenantId = 'tenant-1';
    next();
  },
}));

vi.mock('../middleware/audit.js', () => ({
  audit: () => (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
}));

vi.mock('../middleware/validate.js', () => ({
  validate: () => (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
}));

vi.mock('../store/db.js', () => ({
  pool: {
    query: queryMock,
  },
}));

vi.mock('../store/mapping-memory-repository.js', () => ({
  loadMappingMemory: loadMappingMemoryMock,
  upsertEntry: upsertEntryMock,
}));

vi.mock('../middleware/rate-limit.js', () => ({
  rateLimit: () => (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
}));

vi.mock('@integrax/temporal-workflows', () => ({
  TemporalClientService: class {
    async connect(): Promise<void> {
      if (temporalState.connectShouldFail) {
        throw new Error('ECONNREFUSED temporal:7233');
      }
    }
    async startSchemaDiff(_tenantId: string, _opts: unknown, workflowId: string): Promise<{ workflowId: string }> {
      return { workflowId: workflowId ?? 'workflow-auto' };
    }
    async getWorkflowStatus(_workflowId: string): Promise<{ status: string }> {
      return { status: 'Completed' };
    }
  },
}));

import { schemasRouter } from './schemas.js';

// ─── Zod schema (mirror of schemas.ts for direct unit tests) ─────────────────
const startSchemaDiffOpts = z.object({
  sourceSchemaId: z.string(),
  targetSchemaId: z.string(),
  samplesA: z.array(z.record(z.unknown())).max(2000).optional(),
  samplesB: z.array(z.record(z.unknown())).max(2000).optional(),
  options: z.object({
    renameSimilarityThreshold: z.number().optional(),
    enableLlmEscalation: z.boolean().optional(),
    forceRecalculate: z.boolean().optional(),
    useSampleReservoir: z.boolean().optional(),
    sampleLimit: z.number().int().min(1).max(2000).optional(),
  }).optional(),
}).refine(
  value =>
    ((value.samplesA?.length ?? 0) > 0 && (value.samplesB?.length ?? 0) > 0) ||
    value.options?.useSampleReservoir === true,
  {
    message: 'Provide samplesA/samplesB or enable options.useSampleReservoir',
    path: ['samplesA'],
  },
);

const feedbackBodySchema = z.object({
  sourcePath: z.string().min(1),
  targetPath: z.string().min(1),
  accepted: z.boolean(),
  confidence: z.number().min(0).max(1).default(0.80),
});

// ─── HTTP test suite ──────────────────────────────────────────────────────────

describe('schemas-extended — HTTP routes', () => {
  let server: ReturnType<express.Application['listen']> | null = null;
  let baseUrl = '';

  beforeEach(async () => {
    queryMock.mockReset();
    loadMappingMemoryMock.mockReset();
    upsertEntryMock.mockReset();
    temporalState.connectShouldFail = false;
    loadMappingMemoryMock.mockResolvedValue([]);
    upsertEntryMock.mockResolvedValue(undefined);
    process.env.TEMPORAL_ADDRESS = 'localhost:7233';

    const app = express();
    app.use(express.json());
    app.use('/api/schemas', schemasRouter);

    await new Promise<void>(resolve => {
      server = app.listen(0, '127.0.0.1', () => {
        const address = server!.address();
        if (!address || typeof address === 'string') throw new Error('Unexpected server address');
        baseUrl = `http://127.0.0.1:${address.port}`;
        resolve();
      });
    });
  });

  afterEach(async () => {
    if (!server) return;
    await new Promise<void>((resolve, reject) => {
      server!.close(error => error ? reject(error) : resolve());
    });
    server = null;
  });

  // ── POST /diff — valid request bodies ────────────────────────────────────────

  it.each([
    {
      label: 'mercadopago → contabilium basic',
      body: { sourceSchemaId: 'mercadopago', targetSchemaId: 'contabilium', samplesA: [{ id: '1', monto: 100 }], samplesB: [{ id: '1', amount: 100 }] },
    },
    {
      label: 'afip-wsfe → google-sheets',
      body: { sourceSchemaId: 'afip-wsfe', targetSchemaId: 'google-sheets', samplesA: [{ cae: 'A1' }], samplesB: [{ code: 'A1' }] },
    },
    {
      label: 'whatsapp → email with options',
      body: {
        sourceSchemaId: 'whatsapp',
        targetSchemaId: 'email',
        samplesA: [{ phone: '5491155551234' }],
        samplesB: [{ to: 'user@example.com' }],
        options: { renameSimilarityThreshold: 0.7 },
      },
    },
    {
      label: 'with enableLlmEscalation true',
      body: {
        sourceSchemaId: 'src-A',
        targetSchemaId: 'tgt-B',
        samplesA: [{ x: 1 }],
        samplesB: [{ y: 1 }],
        options: { enableLlmEscalation: true },
      },
    },
    {
      label: 'with forceRecalculate true',
      body: {
        sourceSchemaId: 'src-B',
        targetSchemaId: 'tgt-C',
        samplesA: [{ a: 'hello' }],
        samplesB: [{ b: 'world' }],
        options: { forceRecalculate: true },
      },
    },
    {
      label: 'with useSampleReservoir (no samples needed)',
      body: {
        sourceSchemaId: 'src-R',
        targetSchemaId: 'tgt-R',
        options: { useSampleReservoir: true },
      },
    },
    {
      label: 'with sampleLimit 500',
      body: {
        sourceSchemaId: 'src-C',
        targetSchemaId: 'tgt-D',
        samplesA: [{ f1: 1 }],
        samplesB: [{ g1: 1 }],
        options: { sampleLimit: 500 },
      },
    },
    {
      label: 'all options combined',
      body: {
        sourceSchemaId: 'full-src',
        targetSchemaId: 'full-tgt',
        samplesA: [{ id: '1' }, { id: '2' }],
        samplesB: [{ pk: '1' }, { pk: '2' }],
        options: { renameSimilarityThreshold: 0.8, enableLlmEscalation: false, forceRecalculate: false, sampleLimit: 100 },
      },
    },
    {
      label: 'large samples batch (50 items)',
      body: {
        sourceSchemaId: 'large-src',
        targetSchemaId: 'large-tgt',
        samplesA: Array.from({ length: 50 }, (_, i) => ({ id: String(i), val: i })),
        samplesB: Array.from({ length: 50 }, (_, i) => ({ pk: String(i), value: i })),
      },
    },
    {
      label: 'deep nested sample objects',
      body: {
        sourceSchemaId: 'nested-src',
        targetSchemaId: 'nested-tgt',
        samplesA: [{ order: { id: '1', items: [{ sku: 'ABC', qty: 2 }], total: 200 } }],
        samplesB: [{ purchase: { orderId: '1', products: [{ code: 'ABC', quantity: 2 }], amount: 200 } }],
      },
    },
    {
      label: 'numeric field names in samples',
      body: {
        sourceSchemaId: 'num-src',
        targetSchemaId: 'num-tgt',
        samplesA: [{ '001': 'val1', '002': 'val2' }],
        samplesB: [{ field_1: 'val1', field_2: 'val2' }],
      },
    },
    {
      label: 'samples with null values',
      body: {
        sourceSchemaId: 'null-src',
        targetSchemaId: 'null-tgt',
        samplesA: [{ id: '1', name: null, amount: 100 }],
        samplesB: [{ id: '1', fullName: null, total: 100 }],
      },
    },
    {
      label: 'samples with boolean values',
      body: {
        sourceSchemaId: 'bool-src',
        targetSchemaId: 'bool-tgt',
        samplesA: [{ active: true, verified: false }],
        samplesB: [{ isActive: true, isVerified: false }],
      },
    },
    {
      label: 'samples with date strings',
      body: {
        sourceSchemaId: 'date-src',
        targetSchemaId: 'date-tgt',
        samplesA: [{ fechaCreacion: '2024-01-15T10:00:00Z' }],
        samplesB: [{ createdAt: '2024-01-15T10:00:00Z' }],
      },
    },
    {
      label: 'samples with array values',
      body: {
        sourceSchemaId: 'arr-src',
        targetSchemaId: 'arr-tgt',
        samplesA: [{ tags: ['a', 'b', 'c'] }],
        samplesB: [{ labels: ['a', 'b', 'c'] }],
      },
    },
    {
      label: 'contabilium → afip exact threshold 0.5',
      body: {
        sourceSchemaId: 'contabilium',
        targetSchemaId: 'afip-wsfe',
        samplesA: [{ comprobante_id: 1 }],
        samplesB: [{ voucher_id: 1 }],
        options: { renameSimilarityThreshold: 0.5 },
      },
    },
    {
      label: 'threshold at max boundary 1.0',
      body: {
        sourceSchemaId: 's1',
        targetSchemaId: 't1',
        samplesA: [{ a: 1 }],
        samplesB: [{ b: 1 }],
        options: { renameSimilarityThreshold: 1.0 },
      },
    },
    {
      label: 'threshold at min boundary 0.0',
      body: {
        sourceSchemaId: 's2',
        targetSchemaId: 't2',
        samplesA: [{ a: 1 }],
        samplesB: [{ b: 1 }],
        options: { renameSimilarityThreshold: 0.0 },
      },
    },
    {
      label: 'sampleLimit at exact max 2000',
      body: {
        sourceSchemaId: 's3',
        targetSchemaId: 't3',
        samplesA: [{ x: 1 }],
        samplesB: [{ y: 1 }],
        options: { sampleLimit: 2000 },
      },
    },
    {
      label: 'sampleLimit at min 1',
      body: {
        sourceSchemaId: 's4',
        targetSchemaId: 't4',
        samplesA: [{ x: 1 }],
        samplesB: [{ y: 1 }],
        options: { sampleLimit: 1 },
      },
    },
  ])('POST /diff — 202 for valid body: $label', async ({ body }) => {
    const response = await fetch(`${baseUrl}/api/schemas/diff`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const payload = await response.json();
    expect(response.status).toBe(202);
    expect(payload.success).toBe(true);
    expect(payload.data.workflowId).toBeDefined();
    expect(payload.data.pollUrl).toContain('/api/schemas/status/');
    expect(payload.data.status).toBe('ACCEPTED');
  });

  // ── POST /diff — invalid request bodies (Zod validation bypassed by mock, so test Zod directly) ─

  // ── GET /diff/:workflowId (status) — various workflow statuses ───────────────

  it.each([
    { status: 'Running', hasReport: false },
    { status: 'Completed', hasReport: true },
    { status: 'COMPLETED', hasReport: true },
    { status: 'Failed', hasReport: false },
    { status: 'TimedOut', hasReport: false },
    { status: 'Cancelled', hasReport: false },
    { status: 'ContinuedAsNew', hasReport: false },
    { status: 'Terminated', hasReport: false },
  ])('GET /status — workflow status "$status" returns 200', async ({ status, hasReport }) => {
    const { TemporalClientService } = await import('@integrax/temporal-workflows');
    // Override getWorkflowStatus for this test iteration
    (TemporalClientService.prototype as any).getWorkflowStatus = async () => ({ status });

    if (hasReport) {
      queryMock.mockResolvedValueOnce({ rows: [{ id: 'report-xyz' }] });
    } else {
      queryMock.mockResolvedValueOnce({ rows: [] });
    }

    const workflowId = `schemaDiff-tenant-1-${Date.now()}`;
    const response = await fetch(`${baseUrl}/api/schemas/status/${workflowId}`);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.success).toBe(true);
    expect(payload.data.workflowId).toBe(workflowId);

    if (hasReport) {
      expect(payload.data.reportLink).toContain('/api/schemas/reports/');
    } else {
      expect(payload.data.reportLink).toBeNull();
    }
  });

  // ── GET /status — 403 for wrong tenant prefixes ───────────────────────────

  it.each([
    'schemaDiff-tenant-999-abc',
    'schemaDiff-other-tenant-xyz',
    'schemaDiff-tenant-1extra-abc',
    'schemaDiff--abc',
    'workflow-tenant-1-abc',
    'schemaDiff-abc',
  ])('GET /status — 403 for workflowId "%s" (wrong tenant)', async (workflowId) => {
    const response = await fetch(`${baseUrl}/api/schemas/status/${workflowId}`);
    const payload = await response.json();
    expect(response.status).toBe(403);
    expect(payload.error.code).toBe('FORBIDDEN');
  });

  // ── GET /reports/:id — DB scenarios ─────────────────────────────────────────

  it.each([
    { reportId: 'br_01AAAA', label: 'standard report' },
    { reportId: 'br_01BBBB', label: 'report with different id' },
    { reportId: 'br_CUSTOM_REPORT', label: 'custom prefix report' },
  ])('GET /reports/:id — found ($label)', async ({ reportId }) => {
    queryMock.mockResolvedValueOnce({
      rows: [{
        id: reportId,
        tenant_id: 'tenant-1',
        diff_payload: { reportId, summary: { coveragePercent: 95 } },
      }],
    });

    const response = await fetch(`${baseUrl}/api/schemas/reports/${reportId}`);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.success).toBe(true);
    expect(payload.data.id).toBe(reportId);
  });

  it.each([
    'nonexistent-001',
    'br_NOTFOUND',
    'wrong-tenant-report',
    '00000000',
  ])('GET /reports/:id — 404 for "%s"', async (reportId) => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    const response = await fetch(`${baseUrl}/api/schemas/reports/${reportId}`);
    const payload = await response.json();

    expect(response.status).toBe(404);
    expect(payload.success).toBe(false);
    expect(payload.error.code).toBe('NOT_FOUND');
  });

  it('GET /reports/:id — 500 when DB throws', async () => {
    queryMock.mockRejectedValueOnce(new Error('DB connection lost'));

    const response = await fetch(`${baseUrl}/api/schemas/reports/some-id`);
    const payload = await response.json();

    expect(response.status).toBe(500);
    expect(payload.success).toBe(false);
    expect(payload.error.code).toBe('FETCH_REPORT_FAILED');
  });

  // ── GET /reports (list) ────────────────────────────────────────────────────

  it('GET /reports — returns list of reports', async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        { id: 'r1', tenant_id: 'tenant-1', workflow_id: 'w1', created_at: new Date(), diff_payload: { summary: {} } },
        { id: 'r2', tenant_id: 'tenant-1', workflow_id: 'w2', created_at: new Date(), diff_payload: { summary: {} } },
      ],
    });

    const response = await fetch(`${baseUrl}/api/schemas/reports`);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.success).toBe(true);
    expect(payload.data).toHaveLength(2);
  });

  it('GET /reports — returns empty list when no reports', async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    const response = await fetch(`${baseUrl}/api/schemas/reports`);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.success).toBe(true);
    expect(payload.data).toHaveLength(0);
  });

  it('GET /reports — 500 when DB throws', async () => {
    queryMock.mockRejectedValueOnce(new Error('DB unavailable'));

    const response = await fetch(`${baseUrl}/api/schemas/reports`);
    const payload = await response.json();

    expect(response.status).toBe(500);
    expect(payload.success).toBe(false);
    expect(payload.error.code).toBe('FETCH_REPORTS_FAILED');
  });

  // ── GET /memory — query param combinations ───────────────────────────────

  it.each([
    { connectorAId: 'mercadopago', connectorBId: 'contabilium', entriesCount: 3 },
    { connectorAId: 'afip-wsfe', connectorBId: 'google-sheets', entriesCount: 0 },
    { connectorAId: 'whatsapp', connectorBId: 'email', entriesCount: 10 },
    { connectorAId: 'contabilium', connectorBId: 'mercadopago', entriesCount: 1 },
    { connectorAId: 'google-sheets', connectorBId: 'afip-wsfe', entriesCount: 7 },
  ])('GET /memory — $connectorAId→$connectorBId returns $entriesCount entries', async ({ connectorAId, connectorBId, entriesCount }) => {
    loadMappingMemoryMock.mockResolvedValueOnce(
      Array.from({ length: entriesCount }, (_, i) => ({
        sourcePath: `field_${i}`,
        targetPath: `target_${i}`,
        acceptedCount: i + 1,
        rejectedCount: 0,
      })),
    );

    const url = `${baseUrl}/api/schemas/memory?connectorAId=${connectorAId}&connectorBId=${connectorBId}`;
    const response = await fetch(url);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.success).toBe(true);
    expect(payload.data).toHaveLength(entriesCount);
  });

  it.each([
    '',
    '?connectorAId=mercadopago',
    '?connectorBId=contabilium',
    '?connectorAId=&connectorBId=contabilium',
    '?connectorAId=mercadopago&connectorBId=',
  ])('GET /memory — 400 for incomplete params "%s"', async (queryString) => {
    const response = await fetch(`${baseUrl}/api/schemas/memory${queryString}`);
    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.error.code).toBe('VALIDATION_ERROR');
  });

  it('GET /memory — 500 when loadMappingMemory throws', async () => {
    loadMappingMemoryMock.mockRejectedValueOnce(new Error('Redis timeout'));

    const response = await fetch(`${baseUrl}/api/schemas/memory?connectorAId=a&connectorBId=b`);
    const payload = await response.json();

    expect(response.status).toBe(500);
    expect(payload.success).toBe(false);
    expect(payload.error.code).toBe('MEMORY_FETCH_FAILED');
  });

  // ── POST /reports/:reportId/feedback ────────────────────────────────────────

  it.each([
    {
      label: 'accepted mapping monto→amount',
      reportId: 'br_01',
      body: { sourcePath: 'monto', targetPath: 'amount', accepted: true, confidence: 0.95 },
      source: 'mercadopago',
      target: 'contabilium',
    },
    {
      label: 'rejected mapping total→sum',
      reportId: 'br_02',
      body: { sourcePath: 'total', targetPath: 'sum', accepted: false, confidence: 0.55 },
      source: 'mercadopago',
      target: 'google-sheets',
    },
    {
      label: 'accepted with default confidence',
      reportId: 'br_03',
      body: { sourcePath: 'id', targetPath: 'pk', accepted: true },
      source: 'afip-wsfe',
      target: 'contabilium',
    },
    {
      label: 'low confidence rejection',
      reportId: 'br_04',
      body: { sourcePath: 'fecha', targetPath: 'date', accepted: false, confidence: 0.2 },
      source: 'whatsapp',
      target: 'email',
    },
    {
      label: 'very high confidence acceptance',
      reportId: 'br_05',
      body: { sourcePath: 'customer_id', targetPath: 'clientId', accepted: true, confidence: 0.99 },
      source: 'contabilium',
      target: 'mercadopago',
    },
    {
      label: 'nested path source',
      reportId: 'br_06',
      body: { sourcePath: 'order.customer.id', targetPath: 'customerId', accepted: true, confidence: 0.82 },
      source: 'mercadopago',
      target: 'afip-wsfe',
    },
    {
      label: 'dot-notation target path',
      reportId: 'br_07',
      body: { sourcePath: 'total', targetPath: 'invoice.total', accepted: true, confidence: 0.88 },
      source: 'google-sheets',
      target: 'contabilium',
    },
    {
      label: 'zero confidence (boundary)',
      reportId: 'br_08',
      body: { sourcePath: 'field_a', targetPath: 'field_b', accepted: false, confidence: 0.0 },
      source: 'afip-wsfe',
      target: 'whatsapp',
    },
    {
      label: 'full confidence (boundary)',
      reportId: 'br_09',
      body: { sourcePath: 'reference', targetPath: 'ref', accepted: true, confidence: 1.0 },
      source: 'email',
      target: 'whatsapp',
    },
    {
      label: 'afip to contabilium with breakdown',
      reportId: 'br_10',
      body: {
        sourcePath: 'cae',
        targetPath: 'codigoAutorizacion',
        accepted: true,
        confidence: 0.91,
        breakdown: { lexical: 0.5, value: 0.9, structural: 0.8, businessType: 0.95, ontology: 0.7, sufficiency: 0.85 },
      },
      source: 'afip-wsfe',
      target: 'contabilium',
    },
    {
      label: 'rejection with breakdown',
      reportId: 'br_11',
      body: {
        sourcePath: 'name',
        targetPath: 'address',
        accepted: false,
        confidence: 0.1,
        breakdown: { lexical: 0.0, value: 0.1, structural: 0.0, businessType: 0.0, ontology: 0.0, sufficiency: 0.1 },
      },
      source: 'mercadopago',
      target: 'contabilium',
    },
    {
      label: 'same path names',
      reportId: 'br_12',
      body: { sourcePath: 'id', targetPath: 'id', accepted: true, confidence: 1.0 },
      source: 'mercadopago',
      target: 'afip-wsfe',
    },
    {
      label: 'spanish path names',
      reportId: 'br_13',
      body: { sourcePath: 'monto_total', targetPath: 'total_amount', accepted: true, confidence: 0.75 },
      source: 'contabilium',
      target: 'google-sheets',
    },
    {
      label: 'single char paths',
      reportId: 'br_14',
      body: { sourcePath: 'a', targetPath: 'b', accepted: false, confidence: 0.5 },
      source: 'email',
      target: 'contabilium',
    },
    {
      label: 'numeric-like path names',
      reportId: 'br_15',
      body: { sourcePath: 'campo_01', targetPath: 'field_01', accepted: true, confidence: 0.88 },
      source: 'google-sheets',
      target: 'mercadopago',
    },
  ])('POST /feedback — success: $label', async ({ reportId, body, source, target }) => {
    queryMock.mockResolvedValueOnce({
      rows: [{ source_connector_id: source, target_connector_id: target }],
    });

    const response = await fetch(`${baseUrl}/api/schemas/reports/${reportId}/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.success).toBe(true);
    expect(payload.data.reportId).toBe(reportId);
    expect(payload.data.accepted).toBe(body.accepted);
    expect(payload.data.connectorAId).toBe(source);
    expect(payload.data.connectorBId).toBe(target);
    expect(upsertEntryMock).toHaveBeenCalled();
  });

  it.each([
    'report-not-found-1',
    'br_MISSING',
    'no-such-report',
    '00000000',
  ])('POST /feedback — 404 for missing reportId "%s"', async (reportId) => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    const response = await fetch(`${baseUrl}/api/schemas/reports/${reportId}/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sourcePath: 'a', targetPath: 'b', accepted: true, confidence: 0.8 }),
    });
    const payload = await response.json();

    expect(response.status).toBe(404);
    expect(payload.success).toBe(false);
    expect(payload.error.code).toBe('NOT_FOUND');
  });

  it('POST /feedback — 500 when upsertEntry throws', async () => {
    queryMock.mockResolvedValueOnce({
      rows: [{ source_connector_id: 'src', target_connector_id: 'tgt' }],
    });
    upsertEntryMock.mockRejectedValueOnce(new Error('DB write failed'));

    const response = await fetch(`${baseUrl}/api/schemas/reports/br_ERR/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sourcePath: 'a', targetPath: 'b', accepted: true, confidence: 0.8 }),
    });
    const payload = await response.json();

    expect(response.status).toBe(500);
    expect(payload.success).toBe(false);
    expect(payload.error.code).toBe('FEEDBACK_FAILED');
  });

  // ── 503 when TEMPORAL_ADDRESS is not configured ───────────────────────────

  it('GET /status — 503 if TEMPORAL_ADDRESS not configured', async () => {
    const prev = process.env.TEMPORAL_ADDRESS;
    delete process.env.TEMPORAL_ADDRESS;

    const workflowId = `schemaDiff-tenant-1-test`;
    const response = await fetch(`${baseUrl}/api/schemas/status/${workflowId}`);
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload.error.code).toBe('TEMPORAL_UNAVAILABLE');

    process.env.TEMPORAL_ADDRESS = prev ?? 'localhost:7233';
  });
});

// ─── Zod validation tests (direct schema unit tests) ─────────────────────────

describe('startSchemaDiffOpts — extended Zod validation', () => {
  // Valid cases
  it.each([
    {
      label: 'minimal with both sample arrays',
      input: { sourceSchemaId: 'a', targetSchemaId: 'b', samplesA: [{ x: 1 }], samplesB: [{ y: 1 }] },
    },
    {
      label: 'with useSampleReservoir=true and no samples',
      input: { sourceSchemaId: 'a', targetSchemaId: 'b', options: { useSampleReservoir: true } },
    },
    {
      label: 'with all options defined',
      input: {
        sourceSchemaId: 'a',
        targetSchemaId: 'b',
        samplesA: [{ x: 1 }],
        samplesB: [{ y: 1 }],
        options: { renameSimilarityThreshold: 0.75, enableLlmEscalation: true, forceRecalculate: false, sampleLimit: 100 },
      },
    },
    {
      label: 'multiple samples in each array',
      input: {
        sourceSchemaId: 'multi-src',
        targetSchemaId: 'multi-tgt',
        samplesA: [{ a: 1 }, { a: 2 }, { a: 3 }],
        samplesB: [{ b: 1 }, { b: 2 }, { b: 3 }],
      },
    },
    {
      label: 'threshold at 0',
      input: { sourceSchemaId: 'a', targetSchemaId: 'b', samplesA: [{ x: 1 }], samplesB: [{ y: 1 }], options: { renameSimilarityThreshold: 0 } },
    },
    {
      label: 'sampleLimit at boundary 1',
      input: { sourceSchemaId: 'a', targetSchemaId: 'b', samplesA: [{ x: 1 }], samplesB: [{ y: 1 }], options: { sampleLimit: 1 } },
    },
    {
      label: 'sampleLimit at boundary 2000',
      input: { sourceSchemaId: 'a', targetSchemaId: 'b', samplesA: [{ x: 1 }], samplesB: [{ y: 1 }], options: { sampleLimit: 2000 } },
    },
    {
      label: 'empty options object is valid with samples',
      input: { sourceSchemaId: 'a', targetSchemaId: 'b', samplesA: [{ x: 1 }], samplesB: [{ y: 1 }], options: {} },
    },
    {
      label: 'useSampleReservoir=true overrides empty samples',
      input: { sourceSchemaId: 'a', targetSchemaId: 'b', samplesA: [], samplesB: [], options: { useSampleReservoir: true } },
    },
    {
      label: 'exactly 2000 samplesA and 1 samplesB',
      input: {
        sourceSchemaId: 'a',
        targetSchemaId: 'b',
        samplesA: Array.from({ length: 2000 }, (_, i) => ({ id: i })),
        samplesB: [{ y: 1 }],
      },
    },
  ])('acepta input válido: $label', ({ input }) => {
    const result = startSchemaDiffOpts.safeParse(input);
    expect(result.success).toBe(true);
  });

  // Invalid cases
  it.each([
    {
      label: 'missing both schema ids',
      input: { samplesA: [{ x: 1 }], samplesB: [{ y: 1 }] },
    },
    {
      label: 'missing sourceSchemaId',
      input: { targetSchemaId: 'b', samplesA: [{ x: 1 }], samplesB: [{ y: 1 }] },
    },
    {
      label: 'missing targetSchemaId',
      input: { sourceSchemaId: 'a', samplesA: [{ x: 1 }], samplesB: [{ y: 1 }] },
    },
    {
      label: 'no samples and no reservoir',
      input: { sourceSchemaId: 'a', targetSchemaId: 'b' },
    },
    {
      label: 'only samplesA provided',
      input: { sourceSchemaId: 'a', targetSchemaId: 'b', samplesA: [{ x: 1 }] },
    },
    {
      label: 'only samplesB provided',
      input: { sourceSchemaId: 'a', targetSchemaId: 'b', samplesB: [{ y: 1 }] },
    },
    {
      label: 'samplesA empty, samplesB has items',
      input: { sourceSchemaId: 'a', targetSchemaId: 'b', samplesA: [], samplesB: [{ y: 1 }] },
    },
    {
      label: 'samplesB empty, samplesA has items',
      input: { sourceSchemaId: 'a', targetSchemaId: 'b', samplesA: [{ x: 1 }], samplesB: [] },
    },
    {
      label: 'both samples empty, no reservoir',
      input: { sourceSchemaId: 'a', targetSchemaId: 'b', samplesA: [], samplesB: [] },
    },
    {
      label: 'samplesA over 2000 limit',
      input: {
        sourceSchemaId: 'a',
        targetSchemaId: 'b',
        samplesA: Array.from({ length: 2001 }, (_, i) => ({ id: i })),
        samplesB: [{ y: 1 }],
      },
    },
    {
      label: 'samplesB over 2000 limit',
      input: {
        sourceSchemaId: 'a',
        targetSchemaId: 'b',
        samplesA: [{ x: 1 }],
        samplesB: Array.from({ length: 2001 }, (_, i) => ({ id: i })),
      },
    },
    {
      label: 'sampleLimit below 1',
      input: { sourceSchemaId: 'a', targetSchemaId: 'b', samplesA: [{ x: 1 }], samplesB: [{ y: 1 }], options: { sampleLimit: 0 } },
    },
    {
      label: 'sampleLimit above 2000',
      input: { sourceSchemaId: 'a', targetSchemaId: 'b', samplesA: [{ x: 1 }], samplesB: [{ y: 1 }], options: { sampleLimit: 2001 } },
    },
    {
      label: 'sampleLimit is float (non-integer)',
      input: { sourceSchemaId: 'a', targetSchemaId: 'b', samplesA: [{ x: 1 }], samplesB: [{ y: 1 }], options: { sampleLimit: 1.5 } },
    },
    {
      label: 'sourceSchemaId is empty string',
      input: { sourceSchemaId: '', targetSchemaId: 'b', samplesA: [{ x: 1 }], samplesB: [{ y: 1 }] },
    },
    {
      label: 'targetSchemaId is empty string',
      input: { sourceSchemaId: 'a', targetSchemaId: '', samplesA: [{ x: 1 }], samplesB: [{ y: 1 }] },
    },
    {
      label: 'useSampleReservoir=false and no samples',
      input: { sourceSchemaId: 'a', targetSchemaId: 'b', options: { useSampleReservoir: false } },
    },
    {
      label: 'samplesA is not an array',
      input: { sourceSchemaId: 'a', targetSchemaId: 'b', samplesA: 'not-array', samplesB: [{ y: 1 }] },
    },
    {
      label: 'samplesB is not an array',
      input: { sourceSchemaId: 'a', targetSchemaId: 'b', samplesA: [{ x: 1 }], samplesB: 'not-array' },
    },
  ])('rechaza input inválido: $label', ({ input }) => {
    const result = startSchemaDiffOpts.safeParse(input);
    expect(result.success).toBe(false);
  });
});

// ─── feedbackBodySchema Zod tests ─────────────────────────────────────────────

describe('feedbackBodySchema — Zod validation', () => {
  it.each([
    { sourcePath: 'monto', targetPath: 'amount', accepted: true, confidence: 0.9 },
    { sourcePath: 'id', targetPath: 'pk', accepted: false, confidence: 0.1 },
    { sourcePath: 'fecha', targetPath: 'date', accepted: true },
    { sourcePath: 'a', targetPath: 'b', accepted: true, confidence: 0.0 },
    { sourcePath: 'a', targetPath: 'b', accepted: false, confidence: 1.0 },
    { sourcePath: 'long.path.name', targetPath: 'another.path', accepted: true, confidence: 0.5 },
  ])('acepta feedback válido', (input) => {
    expect(feedbackBodySchema.safeParse(input).success).toBe(true);
  });

  it.each([
    { targetPath: 'amount', accepted: true, confidence: 0.9 },
    { sourcePath: 'monto', accepted: true, confidence: 0.9 },
    { sourcePath: 'monto', targetPath: 'amount', confidence: 0.9 },
    { sourcePath: '', targetPath: 'amount', accepted: true, confidence: 0.9 },
    { sourcePath: 'monto', targetPath: '', accepted: true, confidence: 0.9 },
    { sourcePath: 'monto', targetPath: 'amount', accepted: true, confidence: -0.1 },
    { sourcePath: 'monto', targetPath: 'amount', accepted: true, confidence: 1.1 },
    { sourcePath: 'monto', targetPath: 'amount', accepted: 'yes', confidence: 0.9 },
  ])('rechaza feedback inválido', (input) => {
    expect(feedbackBodySchema.safeParse(input).success).toBe(false);
  });
});
