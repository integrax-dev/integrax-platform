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

export type DriftSeverity = 'minor' | 'major' | 'critical';
export type DriftIncidentStatus = 'open' | 'investigating' | 'resolved' | 'dismissed';

export interface DriftIncident {
  id: string;
  tenantId: string;
  connectorId: string;
  workflowId?: string;
  reportId?: string;
  severity: DriftSeverity;
  compatibilityClass: CompatibilityClass;
  status: DriftIncidentStatus;
  title: string;
  summary: string;
  detectedAt: string;
}

export interface CreateDriftIncidentInput {
  tenantId: string;
  connectorId: string;
  targetConnectorId?: string;
  workflowId?: string;
  reportId?: string;
  title?: string;
  summary?: string;
  status?: DriftIncidentStatus;
  detectedAt?: string;
  diff: ContractDiffSummary;
}

export function createDriftIncident(input: CreateDriftIncidentInput): DriftIncident {
  const severity = mapSeverity(input.diff.compatibilityClass);
  const detectedAt = input.detectedAt ?? new Date().toISOString();
  const changeCount = input.diff.changes.length;
  const title = input.title ?? (
    input.targetConnectorId
      ? `${input.connectorId} -> ${input.targetConnectorId} drift detected`
      : `${input.connectorId} drift detected`
  );
  const summary = input.summary ?? (
    input.targetConnectorId
      ? `${changeCount} contract change(s) detected for ${input.connectorId} -> ${input.targetConnectorId}`
      : `${changeCount} contract change(s) detected with ${input.diff.compatibilityClass} impact`
  );

  return {
    id: input.reportId ? `incident-${input.reportId}` : `${input.connectorId}-${Date.now()}`,
    tenantId: input.tenantId,
    connectorId: input.connectorId,
    workflowId: input.workflowId,
    reportId: input.reportId,
    severity,
    compatibilityClass: input.diff.compatibilityClass,
    status: input.status ?? 'open',
    title,
    summary,
    detectedAt,
  };
}

export function mapSeverity(compatibilityClass: CompatibilityClass): DriftSeverity {
  switch (compatibilityClass) {
    case 'breaking':
      return 'critical';
    case 'review-required':
      return 'major';
    default:
      return 'minor';
  }
}
