/**
 * Connector contract change tracking.
 *
 * A "contract" is the structural schema a connector exposes —
 * field names, types, and cardinalities. A ContractChange is recorded
 * when that structure deviates from the registered baseline.
 *
 * Metadata only — no field values, no tenant business data.
 */

export type ContractChangeType =
  | 'field_added'        // new field appeared in connector output
  | 'field_removed'      // field disappeared from connector output
  | 'type_changed'       // field type changed (e.g. string → number)
  | 'required_changed'   // field changed nullability/requiredness
  | 'format_changed'     // format hint changed (e.g. date format)
  | 'enum_changed';      // allowed enum values changed

export type ContractImpactScore = 0 | 1 | 2 | 3 | 4 | 5;

export interface ContractChange {
  id: string;
  connectorId: string;
  /** The field path that changed — NO values, only structure */
  fieldPath: string;
  changeType: ContractChangeType;
  /** 0 = cosmetic; 5 = breaking for all consumers */
  impactScore: ContractImpactScore;
  /** Number of tenants actively using mappings that reference this field */
  affectedTenantCount: number;
  detectedAt: Date;
  /** Connector schema version where change was first seen */
  schemaVersion?: string;
  /** Human-readable summary of the structural change */
  summary: string;
}

// ─── Baseline registry ────────────────────────────────────────────────────────

export interface ConnectorFieldSpec {
  path: string;
  type: string;
  required: boolean;
  format?: string;
  enumValues?: string[];
}

export interface ConnectorContractBaseline {
  connectorId: string;
  schemaVersion: string;
  fields: ConnectorFieldSpec[];
  registeredAt: Date;
}

// ─── Query ────────────────────────────────────────────────────────────────────

export interface ContractChangeFilter {
  connectorId?: string;
  changeType?: ContractChangeType;
  minImpactScore?: ContractImpactScore;
  since?: Date;
  limit?: number;
}
