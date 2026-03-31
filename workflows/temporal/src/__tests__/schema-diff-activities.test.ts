import { describe, expect, it, vi } from 'vitest';
import type { DiffResult, QueryableClient } from '../activities/schema-diff-activities.js';
import {
  ensureConnectorVersion,
  persistDiffResultTransactional,
} from '../activities/schema-diff-activities.js';
import {
  countReservoirSamples,
  getMemoryVersion,
  loadMappingMemoryEntries,
  loadReservoirSamples,
  rememberAcceptedMappings,
  upsertSampleReservoirEntries,
} from '../activities/schema-diff-repository.js';

type VersionRow = {
  connector_id: string;
  tenant_id: string;
  fingerprint: string;
  version_number: number;
  metadata: string;
};

type ReservoirRow = {
  id: string;
  tenant_id: string;
  schema_id: string;
  sample_hash: string;
  sample_payload: Record<string, unknown>;
  captured_at: number;
};

type MappingMemoryRow = {
  tenant_id: string;
  source_connector_id: string;
  target_connector_id: string;
  source_path: string;
  target_path: string;
  accepted_count: number;
  rejected_count: number;
  average_confidence: number;
  last_report_id: string | null;
  updated_at: string; // ISO string — used by getMemoryVersion
};

type PersistedState = {
  inventory: Map<string, string>;
  versions: VersionRow[];
  reports: Map<string, string>;
  reservoir: Map<string, ReservoirRow>;
  mappingMemory: Map<string, MappingMemoryRow>;
};

class InMemoryClient implements QueryableClient {
  public readonly statements: string[] = [];
  public beginCount = 0;
  public commitCount = 0;
  public rollbackCount = 0;
  public failOn?: string;

  private sequence = 0;
  private state: PersistedState = {
    inventory: new Map(),
    versions: [],
    reports: new Map(),
    reservoir: new Map(),
    mappingMemory: new Map(),
  };

  private txState: PersistedState | null = null;

  async query<T = any>(text: string, values: unknown[] = []): Promise<{ rows: T[]; rowCount?: number }> {
    const normalized = text.replace(/\s+/g, ' ').trim();
    this.statements.push(normalized);

    if (this.failOn && normalized.includes(this.failOn)) {
      throw new Error(`Injected failure for "${this.failOn}"`);
    }

    if (normalized === 'BEGIN') {
      this.beginCount++;
      this.txState = {
        inventory: new Map(this.state.inventory),
        versions: this.state.versions.map(row => ({ ...row })),
        reports: new Map(this.state.reports),
        reservoir: new Map([...this.state.reservoir].map(([key, row]) => [key, { ...row }])),
        mappingMemory: new Map([...this.state.mappingMemory].map(([key, row]) => [key, { ...row }])),
      };
      return { rows: [] as T[] };
    }

    if (normalized === 'COMMIT') {
      this.commitCount++;
      if (this.txState) {
        this.state = this.txState;
        this.txState = null;
      }
      return { rows: [] as T[] };
    }

    if (normalized === 'ROLLBACK') {
      this.rollbackCount++;
      this.txState = null;
      return { rows: [] as T[] };
    }

    const state = this.txState ?? this.state;

    if (normalized.includes('INSERT INTO schema_inventory')) {
      state.inventory.set(values[0] as string, values[1] as string);
      return { rows: [] as T[] };
    }

    if (normalized.includes('FROM connector_schema_versions')) {
      const rows = state.versions
        .filter(row => row.connector_id === values[0] && row.tenant_id === values[1])
        .sort((left, right) => right.version_number - left.version_number)
        .slice(0, 1)
        .map(row => ({
          fingerprint: row.fingerprint,
          version_number: row.version_number,
        })) as T[];
      return { rows, rowCount: rows.length };
    }

    if (normalized.includes('INSERT INTO connector_schema_versions')) {
      const versionNumber = values.length === 4 ? 1 : values[3] as number;
      const metadata = values.length === 4 ? values[3] as string : values[4] as string;
      state.versions.push({
        connector_id: values[0] as string,
        tenant_id: values[1] as string,
        fingerprint: values[2] as string,
        version_number: versionNumber,
        metadata,
      });
      return { rows: [] as T[] };
    }

    if (normalized.includes('INSERT INTO schema_diff_reports')) {
      state.reports.set(values[0] as string, values[8] as string);
      return { rows: [] as T[] };
    }

    if (normalized.includes('INSERT INTO schema_mapping_memory')) {
      const key = [
        values[0],
        values[1],
        values[2],
        values[3],
        values[4],
      ].join('::');
      const existing = state.mappingMemory.get(key);
      const reportId = values[6] as string;
      const confidence = values[5] as number;

      const now = new Date().toISOString();
      if (!existing) {
        state.mappingMemory.set(key, {
          tenant_id: values[0] as string,
          source_connector_id: values[1] as string,
          target_connector_id: values[2] as string,
          source_path: values[3] as string,
          target_path: values[4] as string,
          accepted_count: 1,
          rejected_count: 0,
          average_confidence: confidence,
          last_report_id: reportId,
          updated_at: now,
        });
      } else if (existing.last_report_id !== reportId) {
        const nextAccepted = existing.accepted_count + 1;
        existing.average_confidence = ((existing.average_confidence * existing.accepted_count) + confidence) / nextAccepted;
        existing.accepted_count = nextAccepted;
        existing.last_report_id = reportId;
        existing.updated_at = now;
      }

      return { rows: [] as T[] };
    }

    if (normalized.includes('SELECT COUNT(*) AS count FROM schema_sample_reservoir')) {
      const rows = [{
        count: String(
          [...state.reservoir.values()].filter(
            row => row.tenant_id === values[0] && row.schema_id === values[1],
          ).length,
        ),
      }] as T[];
      return { rows, rowCount: 1 };
    }

    if (normalized.includes('SELECT sample_payload FROM schema_sample_reservoir')) {
      const rows = [...state.reservoir.values()]
        .filter(row => row.tenant_id === values[0] && row.schema_id === values[1])
        .sort((left, right) => right.captured_at - left.captured_at)
        .slice(0, values[2] as number)
        .map(row => ({ sample_payload: row.sample_payload })) as T[];
      return { rows, rowCount: rows.length };
    }

    if (normalized.includes('INSERT INTO schema_sample_reservoir')) {
      const key = [values[0], values[1], values[2]].join('::');
      this.sequence++;
      state.reservoir.set(key, {
        id: `sample-${this.sequence}`,
        tenant_id: values[0] as string,
        schema_id: values[1] as string,
        sample_hash: values[2] as string,
        sample_payload: JSON.parse(values[3] as string),
        captured_at: this.sequence,
      });
      return { rows: [] as T[] };
    }

    if (normalized.includes('DELETE FROM schema_sample_reservoir')) {
      const tenantId = values[0] as string;
      const schemaId = values[1] as string;
      const limit = values[2] as number;
      const rows = [...state.reservoir.entries()]
        .filter(([, row]) => row.tenant_id === tenantId && row.schema_id === schemaId)
        .sort((left, right) => right[1].captured_at - left[1].captured_at);

      rows.slice(limit).forEach(([key]) => {
        state.reservoir.delete(key);
      });
      return { rows: [] as T[] };
    }

    // loadMappingMemoryEntries — now selects connector IDs too
    if (normalized.includes('SELECT source_connector_id, target_connector_id')) {
      const rows = [...state.mappingMemory.values()]
        .filter(row =>
          row.tenant_id === values[0] &&
          row.source_connector_id === values[1] &&
          row.target_connector_id === values[2],
        )
        .slice(0, values[3] as number)
        .map(row => ({
          source_connector_id: row.source_connector_id,
          target_connector_id: row.target_connector_id,
          source_path: row.source_path,
          target_path: row.target_path,
          accepted_count: row.accepted_count,
          rejected_count: row.rejected_count,
          average_confidence: row.average_confidence,
          last_accepted_at: undefined,
        })) as T[];
      return { rows, rowCount: rows.length };
    }

    // getMemoryVersion — returns MAX(updated_at) as a version string
    if (normalized.includes('COALESCE')) {
      const entries = [...state.mappingMemory.values()].filter(row =>
        row.tenant_id === values[0] &&
        row.source_connector_id === values[1] &&
        row.target_connector_id === values[2],
      );
      const version = entries.length === 0
        ? '0'
        : entries.reduce((max, row) => row.updated_at > max ? row.updated_at : max, '');
      return { rows: [{ version }] as T[], rowCount: 1 };
    }

    throw new Error(`Unexpected query in test client: ${normalized}`);
  }

  snapshot(): PersistedState {
    return {
      inventory: new Map(this.state.inventory),
      versions: this.state.versions.map(row => ({ ...row })),
      reports: new Map(this.state.reports),
      reservoir: new Map([...this.state.reservoir].map(([key, row]) => [key, { ...row }])),
      mappingMemory: new Map([...this.state.mappingMemory].map(([key, row]) => [key, { ...row }])),
    };
  }
}

function buildDiffResult(overrides: Partial<DiffResult> = {}): DiffResult {
  return {
    sourceSchemaId: 'sap-erp',
    targetSchemaId: 'coupa',
    workflowId: 'schemaDiff-tenant-1-123',
    hasDifferences: true,
    mismatches: {
      addedFields: [],
      removedFields: [],
      typeChanges: [],
      renameCandidates: [{ fromPath: 'BUKRS', toPath: 'companyCode', similarityPct: 100 }],
    },
    blueprint: [{
      action: 'rename',
      path: 'companyCode',
      fromPath: 'BUKRS',
      toPath: 'companyCode',
      description: 'rename',
    }],
    generatedTransformTs: 'export const noop = true;',
    requiresLLMFallback: false,
    llmEscalations: [],
    summary: {
      totalDiffs: 1,
      breakingCount: 0,
      nonBreakingCount: 1,
      informationalCount: 0,
      llmEscalationCount: 0,
      resolvedDeterministically: 1,
      resolvedByHeuristic: 0,
      coveragePercent: 100,
    },
    reportId: 'br_01TESTREPORT0000000000000000',
    tenantId: 'tenant-1',
    sourceFingerprint: 'source-fingerprint-0000000000000001',
    targetFingerprint: 'target-fingerprint-0000000000000002',
    fullSchemaA: { fields: [{ path: 'BUKRS' }] },
    fullSchemaB: { fields: [{ path: 'companyCode' }] },
    ...overrides,
  };
}

describe('schema diff persistence', () => {
  it('is idempotent across retries for the same report including mapping memory', async () => {
    const client = new InMemoryClient();
    const result = buildDiffResult();

    await persistDiffResultTransactional(client, result);
    await persistDiffResultTransactional(client, result);

    const snapshot = client.snapshot();
    expect(snapshot.inventory.size).toBe(2);
    expect(snapshot.versions).toHaveLength(2);
    expect(snapshot.reports.size).toBe(1);
    expect(snapshot.mappingMemory.size).toBe(1);
    expect([...snapshot.mappingMemory.values()][0].accepted_count).toBe(1);
    expect(client.commitCount).toBe(2);
    expect(client.rollbackCount).toBe(0);
  });

  it('rolls back all writes when report persistence fails mid-transaction', async () => {
    const client = new InMemoryClient();
    client.failOn = 'INSERT INTO schema_diff_reports';

    await expect(persistDiffResultTransactional(client, buildDiffResult()))
      .rejects
      .toThrow('Injected failure');

    const snapshot = client.snapshot();
    expect(snapshot.inventory.size).toBe(0);
    expect(snapshot.versions).toHaveLength(0);
    expect(snapshot.reports.size).toBe(0);
    expect(snapshot.mappingMemory.size).toBe(0);
    expect(client.rollbackCount).toBe(1);
  });

  it('creates a new connector version only when the fingerprint changes', async () => {
    const client = new InMemoryClient();

    await ensureConnectorVersion(client, 'sap-erp', 'tenant-1', 'fp-v1', 'br-report-1');
    await ensureConnectorVersion(client, 'sap-erp', 'tenant-1', 'fp-v1', 'br-report-1');
    await ensureConnectorVersion(client, 'sap-erp', 'tenant-1', 'fp-v2', 'br-report-2');

    const versions = client.snapshot().versions.filter(row => row.connector_id === 'sap-erp');
    expect(versions).toHaveLength(2);
    expect(versions[0].version_number).toBe(1);
    expect(versions[1].version_number).toBe(2);
  });

  it('stores and prunes reservoir samples to the configured window', async () => {
    const client = new InMemoryClient();
    const samples = Array.from({ length: 5 }, (_, index) => ({
      orderId: `ORD-${index + 1}`,
      amount: index + 1,
    }));

    await upsertSampleReservoirEntries(client, 'tenant-1', 'sap-orders', samples, 3);

    expect(await countReservoirSamples(client, 'tenant-1', 'sap-orders')).toBe(3);
    const loaded = await loadReservoirSamples(client, 'tenant-1', 'sap-orders', 10);
    expect(loaded).toHaveLength(3);
    expect(loaded[0].orderId).toBe('ORD-5');
  });
});

// ─── getMemoryVersion ─────────────────────────────────────────────────────────

describe('getMemoryVersion', () => {
  it('returns "0" when no memory entries exist for the connector pair', async () => {
    const client = new InMemoryClient();
    const version = await getMemoryVersion(client, 'tenant-1', 'sap-erp', 'coupa');
    expect(version).toBe('0');
  });

  it('returns a non-zero version after a mapping is persisted', async () => {
    const client = new InMemoryClient();
    await persistDiffResultTransactional(client, buildDiffResult());

    const version = await getMemoryVersion(client, 'tenant-1', 'sap-erp', 'coupa');
    expect(version).not.toBe('0');
    expect(typeof version).toBe('string');
  });

  it('returns a different version after a second persist (updated_at changed)', async () => {
    vi.useFakeTimers();
    try {
      const client = new InMemoryClient();
      await persistDiffResultTransactional(client, buildDiffResult());
      const v1 = await getMemoryVersion(client, 'tenant-1', 'sap-erp', 'coupa');

      vi.advanceTimersByTime(1); // garantiza un nuevo Date.now()

      await persistDiffResultTransactional(client, buildDiffResult({
        reportId: 'br_01TESTREPORT0000000000000001',
      }));
      const v2 = await getMemoryVersion(client, 'tenant-1', 'sap-erp', 'coupa');

      expect(v2).not.toBe(v1);
    } finally {
      vi.useRealTimers();
    }
  });
});

// ─── loadMappingMemoryEntries — connector IDs populated ──────────────────────

describe('loadMappingMemoryEntries', () => {
  it('populates connectorAId and connectorBId on returned entries', async () => {
    const client = new InMemoryClient();
    await persistDiffResultTransactional(client, buildDiffResult());

    const entries = await loadMappingMemoryEntries(client, 'tenant-1', 'sap-erp', 'coupa');
    expect(entries).toHaveLength(1);
    expect(entries[0].connectorAId).toBe('sap-erp');
    expect(entries[0].connectorBId).toBe('coupa');
    expect(entries[0].sourcePath).toBe('BUKRS');
    expect(entries[0].targetPath).toBe('companyCode');
  });

  it('returns empty array when no entries exist', async () => {
    const client = new InMemoryClient();
    const entries = await loadMappingMemoryEntries(client, 'tenant-1', 'sap-erp', 'coupa');
    expect(entries).toHaveLength(0);
  });

  it('respects the limit parameter', async () => {
    const client = new InMemoryClient();
    // Persist two different rename pairs
    await persistDiffResultTransactional(client, buildDiffResult());
    await persistDiffResultTransactional(client, buildDiffResult({
      reportId: 'br_01TESTREPORT0000000000000002',
      mismatches: {
        addedFields: [], removedFields: [], typeChanges: [],
        renameCandidates: [{ fromPath: 'WAERS', toPath: 'currency', similarityPct: 95 }],
      },
      blueprint: [{ action: 'rename', path: 'currency', fromPath: 'WAERS', toPath: 'currency', description: 'rename' }],
    }));

    const limited = await loadMappingMemoryEntries(client, 'tenant-1', 'sap-erp', 'coupa', 1);
    expect(limited).toHaveLength(1);
  });
});

// ─── rememberAcceptedMappings — idempotency ───────────────────────────────────

describe('rememberAcceptedMappings idempotency', () => {
  it('same report ID does not increment accepted_count twice', async () => {
    const client = new InMemoryClient();
    const result = buildDiffResult();

    await rememberAcceptedMappings(client, result, 'tenant-1');
    await rememberAcceptedMappings(client, result, 'tenant-1');

    const entries = await loadMappingMemoryEntries(client, 'tenant-1', 'sap-erp', 'coupa');
    expect(entries[0].acceptedCount).toBe(1);
  });

  it('different report IDs do increment accepted_count', async () => {
    const client = new InMemoryClient();

    await rememberAcceptedMappings(client, buildDiffResult({ reportId: 'br_report_A' }), 'tenant-1');
    await rememberAcceptedMappings(client, buildDiffResult({ reportId: 'br_report_B' }), 'tenant-1');

    const entries = await loadMappingMemoryEntries(client, 'tenant-1', 'sap-erp', 'coupa');
    expect(entries[0].acceptedCount).toBe(2);
  });

  it('weighted average is correct across two distinct reports', async () => {
    const client = new InMemoryClient();
    // Report A: BUKRS↔companyCode con similarity 1.00
    // Report B: mismo par con similarity 0.80
    // avg esperado: (1.00 * 1 + 0.80) / 2 = 0.90
    await rememberAcceptedMappings(client, buildDiffResult({
      reportId: 'br_report_A',
      mismatches: { addedFields: [], removedFields: [], typeChanges: [],
        renameCandidates: [{ fromPath: 'BUKRS', toPath: 'companyCode', similarityPct: 100 }] },
    }), 'tenant-1');
    await rememberAcceptedMappings(client, buildDiffResult({
      reportId: 'br_report_B',
      mismatches: { addedFields: [], removedFields: [], typeChanges: [],
        renameCandidates: [{ fromPath: 'BUKRS', toPath: 'companyCode', similarityPct: 80 }] },
    }), 'tenant-1');

    const entries = await loadMappingMemoryEntries(client, 'tenant-1', 'sap-erp', 'coupa');
    expect(entries[0].averageConfidence).toBeCloseTo(0.90, 5);
  });
});
