import { describe, expect, it } from 'vitest';
import type { DiffResult, QueryableClient } from '../activities/schema-diff-activities.js';
import {
  ensureConnectorVersion,
  persistDiffResultTransactional,
} from '../activities/schema-diff-activities.js';

type VersionRow = {
  connector_id: string;
  tenant_id: string;
  fingerprint: string;
  version_number: number;
  metadata: string;
};

type PersistedState = {
  inventory: Map<string, string>;
  versions: VersionRow[];
  reports: Map<string, string>;
};

class InMemoryClient implements QueryableClient {
  public readonly statements: string[] = [];
  public beginCount = 0;
  public commitCount = 0;
  public rollbackCount = 0;
  public failOn?: string;

  private state: PersistedState = {
    inventory: new Map(),
    versions: [],
    reports: new Map(),
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
      state.reports.set(values[0] as string, values[7] as string);
      return { rows: [] as T[] };
    }

    throw new Error(`Unexpected query in test client: ${normalized}`);
  }

  snapshot(): PersistedState {
    return {
      inventory: new Map(this.state.inventory),
      versions: this.state.versions.map(row => ({ ...row })),
      reports: new Map(this.state.reports),
    };
  }
}

function buildDiffResult(overrides: Partial<DiffResult> = {}): DiffResult {
  return {
    sourceSchemaId: 'sap-erp',
    targetSchemaId: 'coupa',
    hasDifferences: true,
    mismatches: {
      addedFields: [],
      removedFields: [],
      typeChanges: [],
      renameCandidates: [],
    },
    blueprint: [],
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
  it('is idempotent across retries for the same report', async () => {
    const client = new InMemoryClient();
    const result = buildDiffResult();

    await persistDiffResultTransactional(client, result);
    await persistDiffResultTransactional(client, result);

    const snapshot = client.snapshot();
    expect(snapshot.inventory.size).toBe(2);
    expect(snapshot.versions).toHaveLength(2);
    expect(snapshot.reports.size).toBe(1);
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
});
