// Inlined from @integrax/authority-engine to keep this package dependency-free
export type AuthorityMode =
  | 'observe_only' | 'suggest' | 'auto_accept' | 'prefer_a' | 'prefer_b'
  | 'latest_wins' | 'highest_value' | 'manual_resolution';

// Inlined from @integrax/tolerance-engine to keep this package dependency-free
export type ToleranceStrategy =
  | 'absolute' | 'relative' | 'percentage' | 'exact' | 'always_pass';

// ─── Intent primitives ───────────────────────────────────────────────────────

export type PropagationIntent =
  | 'mirror'    // replicate changes exactly across connectors
  | 'adjust'    // propagate with channel-specific transformations
  | 'derive'    // compute derived value from source
  | 'lock'      // field is immutable after initial creation
  | 'ignore'    // do not propagate this field
  | 'approve';  // changes require human approval before propagation

export type DivergenceMode =
  | 'strict_sync'         // any divergence triggers resolution
  | 'channel_adjusted'    // tolerates channel-specific adjustments
  | 'bidirectional_sync'  // both connectors can win; conflicts are merged
  | 'manual_resolution'   // all conflicts go to human queue
  | 'regulatory_locked'   // value is locked by regulation; cannot be overridden
  | 'observe_only';       // record but never act

// ─── Intent statement ────────────────────────────────────────────────────────

export type IntentTrigger =
  | 'entity.created'
  | 'entity.updated'
  | 'field.changed'
  | 'conflict.detected';

export interface ToleranceRef {
  strategy: ToleranceStrategy;
  value: number;
  unit?: string;
}

export interface IntentStatement {
  id: string;
  tenantId: string;
  when: IntentTrigger;
  entityType: string;
  /** undefined = applies to the entire entity */
  field?: string;
  /** Connector IDs involved in this intent */
  connectors: string[];
  propagation: PropagationIntent;
  divergenceMode: DivergenceMode;
  /** When propagation = 'mirror' or 'adjust', which connector is authoritative */
  authorityConnector?: string;
  toleranceSpec?: ToleranceRef;
  /** ISO 3166-1 alpha-2 country code; limits scope to connectors operating in that country */
  country?: string;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Policy graph ─────────────────────────────────────────────────────────────

export interface PolicyNode {
  id: string;
  intentId: string;
  entityType: string;
  field?: string;
  connectors: string[];
  authorityMode: AuthorityMode;
  propagation: PropagationIntent;
  divergenceMode: DivergenceMode;
  toleranceSpec?: ToleranceRef;
}

export interface PolicyEdge {
  from: string;  // PolicyNode.id
  to: string;    // PolicyNode.id
  reason: string;
}

export interface ExecutionStep {
  order: number;
  nodeId: string;
  action: 'evaluate' | 'propagate' | 'escalate' | 'lock' | 'skip';
  condition?: string;
}

export interface ExecutionPlan {
  steps: ExecutionStep[];
  estimatedComplexity: 'low' | 'medium' | 'high';
}

export interface PolicyGraph {
  tenantId: string;
  nodes: PolicyNode[];
  edges: PolicyEdge[];
  executionPlan: ExecutionPlan;
  compiledAt: Date;
  profileId?: BehaviorProfileId;
}

// ─── Behavior profiles ────────────────────────────────────────────────────────

export type BehaviorProfileId =
  | 'ecommerce_standard'
  | 'marketplace_strict'
  | 'accounting_locked'
  | 'inventory_realtime'
  | 'regulatory_ar'
  | 'bidirectional_crm'
  | 'observe_only';

export interface BehaviorProfile {
  id: BehaviorProfileId;
  name: string;
  description: string;
  defaultDivergenceMode: DivergenceMode;
  defaultPropagation: PropagationIntent;
  defaultAuthorityMode: AuthorityMode;
  entityDefaults: Partial<Record<string, {
    divergenceMode?: DivergenceMode;
    propagation?: PropagationIntent;
    authorityMode?: AuthorityMode;
  }>>;
}
