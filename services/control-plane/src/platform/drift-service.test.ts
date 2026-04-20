/**
 * DriftService unit tests
 *
 * Mocks: drift-store (Postgres), schema-bridge (LLM calls), event-bus,
 * platform-emitter, LLM container.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── Hoisted mocks ─────────────────────────────────────────────────────────────

const {
  saveBaselineMock,
  getBaselineMock,
  saveDriftIncidentMock,
  findOpenIncidentMock,
  updateDriftIncidentReportMock,
  updateDriftIncidentStatusMock,
  resolveOpenIncidentsBySourceMock,
  saveDriftLlmAnalysisMock,
  listBaselinesMock,
  compareMock,
  assessImpactMock,
  publishMock,
  emitPlatformEventMock,
} = vi.hoisted(() => ({
  saveBaselineMock: vi.fn(),
  getBaselineMock: vi.fn(),
  saveDriftIncidentMock: vi.fn(),
  findOpenIncidentMock: vi.fn<[], Promise<import('./drift-service.js').DriftIncident | null>>().mockResolvedValue(null),
  updateDriftIncidentReportMock: vi.fn(),
  updateDriftIncidentStatusMock: vi.fn(),
  resolveOpenIncidentsBySourceMock: vi.fn<[], Promise<string[]>>().mockResolvedValue([]),
  saveDriftLlmAnalysisMock: vi.fn(),
  listBaselinesMock: vi.fn<[], Promise<unknown[]>>().mockResolvedValue([]),
  compareMock: vi.fn(),
  assessImpactMock: vi.fn(),
  publishMock: vi.fn<[unknown], Promise<void>>().mockResolvedValue(undefined),
  emitPlatformEventMock: vi.fn(),
}));

vi.mock('../store/drift-store.js', () => ({
  saveBaseline: saveBaselineMock,
  getBaseline: getBaselineMock,
  saveDriftIncident: saveDriftIncidentMock,
  findOpenIncident: findOpenIncidentMock,
  updateDriftIncidentReport: updateDriftIncidentReportMock,
  updateDriftIncidentStatus: updateDriftIncidentStatusMock,
  resolveOpenIncidentsBySource: resolveOpenIncidentsBySourceMock,
  saveDriftLlmAnalysis: saveDriftLlmAnalysisMock,
  listBaselines: listBaselinesMock,
  getDriftIncident: vi.fn().mockResolvedValue(null),
}));

vi.mock('@integrax/schema-bridge', () => ({
  createSchemaBridge: () => ({ compare: compareMock }),
  assessImpact: assessImpactMock,
  SqlDdlAdapter: class {
    constructor(_raw: string) {}
    adapt() { return [{ path: 'id', type: 'integer', required: false, description: '' }]; }
  },
  OpenApiAdapter: class {
    constructor(_raw: string, _fmt?: string) {}
    adapt() { return []; }
  },
}));

vi.mock('./container/event-bus.js', () => ({
  eventBus: { publish: publishMock },
  eventBusReady: Promise.resolve({ publish: publishMock }),
}));

vi.mock('./platform-emitter.js', () => ({
  emitPlatformEvent: emitPlatformEventMock,
}));

vi.mock('./container/llm.js', () => ({
  llm: null,
}));

// ── Import after mocks ────────────────────────────────────────────────────────

import { DriftService } from './drift-service.js';
import type { DriftIncident } from '../store/drift-store.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const NOW = new Date('2025-01-15T00:00:00Z');

function makeIncident(overrides: Partial<DriftIncident> = {}): DriftIncident {
  return {
    id: 'inc-1',
    sourceId: 'orders-api',
    protocol: 'openapi',
    severity: 'major',
    status: 'open',
    bridgeReport: null,
    impactScore: 0.6,
    routingTarget: 'operator_review',
    remediationHints: [],
    affectedTenants: ['T1'],
    llmAnalysis: [],
    detectedAt: NOW,
    resolvedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function noDriftReport() {
  return { diffs: [], requirementsReport: { llmEscalations: [] } };
}

function driftReport() {
  return {
    diffs: [{ path: 'price', changeType: 'type_changed' }],
    requirementsReport: { llmEscalations: [] },
  };
}

function assessment(impactScore = 60, severity = 'major') {
  return {
    impactScore,
    primaryRoutingTarget: 'operator_review',
    remediationHints: [],
    _severity: severity,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('DriftService.captureBaseline', () => {
  let svc: DriftService;

  beforeEach(() => {
    vi.clearAllMocks();
    svc = new DriftService();
    saveBaselineMock.mockResolvedValue(undefined);
    resolveOpenIncidentsBySourceMock.mockResolvedValue([]);
  });

  it('saves baseline and returns 0 when no open incidents exist', async () => {
    const resolved = await svc.captureBaseline('orders-api', 'sql', 'CREATE TABLE orders (id INT)');
    expect(saveBaselineMock).toHaveBeenCalledOnce();
    expect(resolved).toBe(0);
  });

  it('auto-resolves open incidents and returns count', async () => {
    resolveOpenIncidentsBySourceMock.mockResolvedValue(['inc-1', 'inc-2']);
    const resolved = await svc.captureBaseline('orders-api', 'sql', 'CREATE TABLE orders (id INT)');
    expect(resolved).toBe(2);
  });
});

describe('DriftService.ingest — first run', () => {
  let svc: DriftService;

  beforeEach(() => {
    vi.clearAllMocks();
    svc = new DriftService();
    getBaselineMock.mockResolvedValue(null); // no baseline
    saveBaselineMock.mockResolvedValue(undefined);
  });

  it('saves baseline on first run and returns null', async () => {
    const result = await svc.ingest('orders-api', 'sql', 'CREATE TABLE orders (id INT)');
    expect(saveBaselineMock).toHaveBeenCalledOnce();
    expect(result).toBeNull();
  });

  it('does not call bridge.compare on first run', async () => {
    await svc.ingest('orders-api', 'sql', 'CREATE TABLE orders (id INT)');
    expect(compareMock).not.toHaveBeenCalled();
  });
});

describe('DriftService.ingest — no drift', () => {
  let svc: DriftService;

  beforeEach(() => {
    vi.clearAllMocks();
    svc = new DriftService();
    getBaselineMock.mockResolvedValue({
      id: 'b1', sourceId: 'orders-api', protocol: 'sql',
      snapshot: { fields: [{ path: 'id', type: 'integer' }] },
      version: 1, capturedAt: NOW, updatedAt: NOW,
    });
    findOpenIncidentMock.mockResolvedValue(null);
    compareMock.mockResolvedValue(noDriftReport());
  });

  it('returns null when bridge finds no diffs', async () => {
    const result = await svc.ingest('orders-api', 'sql', 'CREATE TABLE orders (id INT)');
    expect(result).toBeNull();
    expect(saveDriftIncidentMock).not.toHaveBeenCalled();
  });

  it('does not publish an event when no drift', async () => {
    await svc.ingest('orders-api', 'sql', 'CREATE TABLE orders (id INT)');
    expect(publishMock).not.toHaveBeenCalled();
  });
});

describe('DriftService.ingest — drift detected', () => {
  let svc: DriftService;

  beforeEach(() => {
    vi.clearAllMocks();
    svc = new DriftService();
    getBaselineMock.mockResolvedValue({
      id: 'b1', sourceId: 'orders-api', protocol: 'openapi',
      snapshot: { fields: [] },
      version: 1, capturedAt: NOW, updatedAt: NOW,
    });
    findOpenIncidentMock.mockResolvedValue(null);
    compareMock.mockResolvedValue(driftReport());
    assessImpactMock.mockReturnValue(assessment(65));
    saveDriftIncidentMock.mockResolvedValue('inc-new');
  });

  it('creates a DriftIncident and returns it', async () => {
    const result = await svc.ingest('orders-api', 'openapi', 'openapi: "3.0.0"', ['T1']);
    expect(result).not.toBeNull();
    expect(result!.sourceId).toBe('orders-api');
    expect(result!.status).toBe('open');
    expect(saveDriftIncidentMock).toHaveBeenCalledOnce();
  });

  it('maps impactScore 65 → major severity', async () => {
    const result = await svc.ingest('orders-api', 'openapi', '...', ['T1']);
    expect(result!.severity).toBe('major');
  });

  it('maps impactScore 90 → critical severity', async () => {
    assessImpactMock.mockReturnValue(assessment(90));
    const result = await svc.ingest('orders-api', 'openapi', '...', ['T1']);
    expect(result!.severity).toBe('critical');
  });

  it('maps impactScore 20 → minor severity', async () => {
    assessImpactMock.mockReturnValue(assessment(20));
    const result = await svc.ingest('orders-api', 'openapi', '...', ['T1']);
    expect(result!.severity).toBe('minor');
  });

  it('publishes conflict.detected for major+ severity', async () => {
    assessImpactMock.mockReturnValue(assessment(70));
    await svc.ingest('orders-api', 'openapi', '...', ['T1']);
    // publishMock is called async (fire-and-forget), give event loop a tick
    await new Promise(r => setTimeout(r, 10));
    expect(publishMock).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'conflict.detected', entityType: 'drift_incident' }),
    );
  });

  it('does NOT publish event for minor severity', async () => {
    assessImpactMock.mockReturnValue(assessment(20));
    await svc.ingest('orders-api', 'openapi', '...', ['T1']);
    await new Promise(r => setTimeout(r, 10));
    expect(publishMock).not.toHaveBeenCalled();
  });

  it('emits platform event on new incident', async () => {
    await svc.ingest('orders-api', 'openapi', '...', ['T1']);
    expect(emitPlatformEventMock).toHaveBeenCalledWith(
      'incident.created',
      expect.objectContaining({ sourceId: 'orders-api' }),
    );
  });

  it('stores affected tenants in the incident', async () => {
    const result = await svc.ingest('orders-api', 'openapi', '...', ['T1', 'T2', 'T3']);
    expect(result!.affectedTenants).toEqual(['T1', 'T2', 'T3']);
  });
});

describe('DriftService.ingest — deduplication', () => {
  let svc: DriftService;
  const existing = makeIncident({ id: 'inc-existing', severity: 'major' });

  beforeEach(() => {
    vi.clearAllMocks();
    svc = new DriftService();
    getBaselineMock.mockResolvedValue({
      id: 'b1', sourceId: 'orders-api', protocol: 'openapi',
      snapshot: { fields: [] },
      version: 1, capturedAt: NOW, updatedAt: NOW,
    });
    findOpenIncidentMock.mockResolvedValue(existing);
    compareMock.mockResolvedValue(driftReport());
    assessImpactMock.mockReturnValue(assessment(65));
    updateDriftIncidentReportMock.mockResolvedValue(undefined);
  });

  it('updates existing open incident instead of creating a new one', async () => {
    await svc.ingest('orders-api', 'openapi', '...');
    expect(updateDriftIncidentReportMock).toHaveBeenCalledWith('inc-existing', expect.any(Object));
    expect(saveDriftIncidentMock).not.toHaveBeenCalled();
  });

  it('returns the updated incident with id from the existing one', async () => {
    const result = await svc.ingest('orders-api', 'openapi', '...');
    expect(result!.id).toBe('inc-existing');
  });

  it('emits incident.updated (not incident.created) for dedup', async () => {
    await svc.ingest('orders-api', 'openapi', '...');
    expect(emitPlatformEventMock).toHaveBeenCalledWith(
      'incident.updated',
      expect.objectContaining({ id: 'inc-existing' }),
    );
  });
});

describe('DriftService.updateStatus', () => {
  let svc: DriftService;

  beforeEach(() => {
    vi.clearAllMocks();
    svc = new DriftService();
    updateDriftIncidentStatusMock.mockResolvedValue(undefined);
  });

  it('delegates to the store', async () => {
    await svc.updateStatus('inc-1', 'investigating');
    expect(updateDriftIncidentStatusMock).toHaveBeenCalledWith('inc-1', 'investigating');
  });
});

describe('DriftService.listBaselines', () => {
  let svc: DriftService;

  beforeEach(() => {
    vi.clearAllMocks();
    svc = new DriftService();
    listBaselinesMock.mockResolvedValue([{ id: 'b1', sourceId: 'x', protocol: 'sql' }]);
  });

  it('returns whatever the store returns', async () => {
    const result = await svc.listBaselines();
    expect(result).toHaveLength(1);
  });
});

describe('DriftService — multiple protocols', () => {
  let svc: DriftService;

  afterEach(() => vi.clearAllMocks());

  beforeEach(() => {
    svc = new DriftService();
    getBaselineMock.mockResolvedValue(null);
    saveBaselineMock.mockResolvedValue(undefined);
  });

  it.each([
    ['sql',      'CREATE TABLE t (id INT);'],
    ['openapi',  'openapi: "3.0.0"\npaths: {}'],
    ['avro',     JSON.stringify({ fields: [{ name: 'id', type: 'string' }] })],
    ['csv',      'id,name,amount'],
    ['jsonl',    '{"id":1,"name":"test"}'],
    ['graphql',  'type Query { user: User }'],
    ['parquet',  JSON.stringify({ columns: [{ name: 'id', type: 'INT64' }] })],
    ['protobuf', 'message Order { string id = 1; }'],
    ['xml',      '<root><id>1</id></root>'],
    ['soap',     '<definitions><types><schema/></types></definitions>'],
  ] as const)('ingest with protocol %s returns null on first run', async (protocol, raw) => {
    const result = await svc.ingest('src', protocol, raw);
    expect(result).toBeNull();
    expect(saveBaselineMock).toHaveBeenCalledOnce();
  });
});
