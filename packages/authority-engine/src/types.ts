export type AuthorityMode =
  | 'observe_only'       // never override; only record divergence
  | 'suggest'            // surface suggestion to human; no auto-action
  | 'auto_accept'        // accept connector A's value automatically
  | 'prefer_a'           // connector A wins; B is updated
  | 'prefer_b'           // connector B wins; A is updated
  | 'latest_wins'        // most recently updated source wins
  | 'highest_value'      // higher numeric value wins (e.g. available stock)
  | 'manual_resolution'; // flag for human queue

export interface AuthorityRule {
  id: string;
  /** undefined = platform-wide default (only platform_admin can set) */
  tenantId?: string;
  /** undefined = applies to all entity types */
  entityType?: string;
  /** undefined = applies to all fields */
  field?: string;
  /** undefined = applies to all connector pairs */
  connectorPair?: readonly [string, string];
  mode: AuthorityMode;
  /** Required when mode is 'prefer_a' or 'prefer_b' */
  authorityConnector?: string;
  /** Higher priority is evaluated first; first matching rule wins */
  priority: number;
  /** Who approved this rule. Required before rule can be activated. */
  approvedBy?: string;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface AuthorityResolution {
  mode: AuthorityMode;
  authorityConnector?: string;
  rule: AuthorityRule | null;
  /** 'explicit_rule' when a stored rule matched; 'default' otherwise */
  source: 'explicit_rule' | 'default';
}

export interface TrustScore {
  connectorId: string;
  tenantId: string;
  entityType?: string;
  /** 0..1 — higher = more trusted as authority */
  score: number;
  acceptedCount: number;
  rejectedCount: number;
  correctionCount: number;
  lastUpdated: Date;
}

export interface TrustUpdateEvent {
  connectorId: string;
  tenantId: string;
  entityType?: string;
  outcome: 'accepted' | 'rejected' | 'corrected';
}

export interface AuthoritySuggestion {
  suggestedMode: AuthorityMode;
  suggestedAuthorityConnector?: string;
  confidence: number;
  reasoning: string;
  requiresApproval: true;
}
