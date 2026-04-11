import type { ConflictCategory, Severity } from '@integrax/platform-kernel';

export type InspectionIssueKind =
  | 'stock_divergence'
  | 'price_divergence'
  | 'invoice_missing'
  | 'duplicate_customer'
  | 'shipment_orphaned'
  | 'state_mismatch'
  | 'identity_conflict'
  | 'financial_conflict';

export interface ConsistencyIssue {
  kind: InspectionIssueKind;
  category: ConflictCategory;
  severity: Severity;
  entityType: string;
  canonicalId?: string;
  systemA: string;
  systemB?: string;
  valueA?: unknown;
  valueB?: unknown;
  description: string;
  detectedAt: Date;
}

export interface ConsistencyReport {
  tenantId: string;
  entityType: string;
  inspectedAt: Date;
  issues: ConsistencyIssue[];
  summary: {
    total: number;
    bySeverity: Record<Severity, number>;
    byKind: Partial<Record<InspectionIssueKind, number>>;
  };
}

export interface InspectionFilter {
  entityTypes?: string[];
  severity?: Severity[];
  since?: Date;
}

export interface ConsistencyInspector {
  inspect(tenantId: string, entityType: string): Promise<ConsistencyReport>;
  inspectAll(tenantId: string, filter?: InspectionFilter): Promise<ConsistencyReport[]>;
}
