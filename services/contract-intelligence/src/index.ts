export type CompatibilityClass = 'safe' | 'suspicious' | 'review-required' | 'breaking';

export interface ContractSnapshotRef {
  connectorId: string;
  version: string;
  fingerprint?: string;
}

export interface ContractFieldChange {
  type: 'field-added' | 'field-removed' | 'field-renamed' | 'type-changed' | 'enum-changed' | 'requiredness-changed';
  path: string;
  summary: string;
}

export interface ContractDiffSummary {
  source: ContractSnapshotRef;
  target: ContractSnapshotRef;
  compatibilityClass: CompatibilityClass;
  changes: ContractFieldChange[];
  affectedPaths: string[];
}

export interface RawSchemaDiffMismatches {
  addedFields?: string[];
  removedFields?: string[];
  typeChanges?: Array<{ path: string; fromType: string; toType: string }>;
  renameCandidates?: Array<{ fromPath: string; toPath: string; similarityPct: number }>;
}

export interface RawSchemaDiffPayload {
  summary?: {
    coveragePercent?: number;
    breakingCount?: number;
    nonBreakingCount?: number;
  };
  mismatches?: RawSchemaDiffMismatches;
}

export interface NormalizeContractInput {
  connectorId: string;
  version: string;
  document: unknown;
}

export interface NormalizedContract {
  connectorId: string;
  version: string;
  operations: string[];
  raw: unknown;
}

export function normalizeContract(input: NormalizeContractInput): NormalizedContract {
  const operations = extractOperations(input.document);

  return {
    connectorId: input.connectorId,
    version: input.version,
    operations,
    raw: input.document,
  };
}

export function summarizeContractDiff(
  source: ContractSnapshotRef,
  target: ContractSnapshotRef,
  changes: ContractFieldChange[],
): ContractDiffSummary {
  const compatibilityClass = classifyCompatibility(changes);
  const affectedPaths = [...new Set(changes.map(change => change.path))];

  return {
    source,
    target,
    compatibilityClass,
    changes,
    affectedPaths,
  };
}

export function classifyCompatibility(changes: ContractFieldChange[]): CompatibilityClass {
  if (changes.some(change => change.type === 'field-removed' || change.type === 'requiredness-changed' || change.type === 'type-changed')) {
    return 'breaking';
  }

  if (changes.some(change => change.type === 'field-renamed' || change.type === 'enum-changed')) {
    return 'review-required';
  }

  if (changes.length > 0) {
    return 'suspicious';
  }

  return 'safe';
}

export function buildContractChanges(payload?: RawSchemaDiffPayload | null): ContractFieldChange[] {
  const mismatches = payload?.mismatches;
  if (!mismatches) return [];

  return [
    ...(mismatches.renameCandidates ?? []).map(candidate => ({
      type: 'field-renamed' as const,
      path: `${candidate.fromPath} -> ${candidate.toPath}`,
      summary: `Rename candidate ${candidate.fromPath} -> ${candidate.toPath} (${candidate.similarityPct}%)`,
    })),
    ...(mismatches.addedFields ?? []).map(path => ({
      type: 'field-added' as const,
      path,
      summary: `Field added: ${path}`,
    })),
    ...(mismatches.removedFields ?? []).map(path => ({
      type: 'field-removed' as const,
      path,
      summary: `Field removed: ${path}`,
    })),
    ...(mismatches.typeChanges ?? []).map(change => ({
      type: 'type-changed' as const,
      path: change.path,
      summary: `Type changed: ${change.fromType} -> ${change.toType}`,
    })),
  ];
}

export function summarizeSchemaDiffReport(input: {
  sourceConnectorId: string;
  targetConnectorId: string;
  sourceVersion?: string;
  targetVersion?: string;
  payload?: RawSchemaDiffPayload | null;
}): ContractDiffSummary {
  const changes = buildContractChanges(input.payload);
  const summary = input.payload?.summary;
  const fallbackCompatibility =
    (summary?.breakingCount ?? 0) > 0
      ? 'breaking'
      : (summary?.nonBreakingCount ?? 0) > 0
        ? 'review-required'
        : 'safe';

  const baseSummary = summarizeContractDiff(
    {
      connectorId: input.sourceConnectorId,
      version: input.sourceVersion ?? 'current',
    },
    {
      connectorId: input.targetConnectorId,
      version: input.targetVersion ?? 'current',
    },
    changes,
  );

  if (baseSummary.compatibilityClass === 'safe' && fallbackCompatibility !== 'safe') {
    return {
      ...baseSummary,
      compatibilityClass: fallbackCompatibility,
    };
  }

  return baseSummary;
}

function extractOperations(document: unknown): string[] {
  if (!document || typeof document !== 'object') return [];

  const maybePaths = (document as { paths?: Record<string, Record<string, unknown>> }).paths;
  if (!maybePaths || typeof maybePaths !== 'object') return [];

  const operations: string[] = [];
  for (const [path, methods] of Object.entries(maybePaths)) {
    if (!methods || typeof methods !== 'object') continue;
    for (const method of Object.keys(methods)) {
      operations.push(`${method.toUpperCase()} ${path}`);
    }
  }

  return operations.sort();
}
