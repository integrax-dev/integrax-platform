import type { IntegraxEventType } from '@integrax/event-bus';

// ─── Trigger ─────────────────────────────────────────────────────────────────

export type FlowTrigger =
  | { type: 'event';    eventType: IntegraxEventType }
  | { type: 'schedule'; cron: string }
  | { type: 'webhook';  connectorId: string; eventType?: IntegraxEventType }
  | { type: 'manual' };

// ─── Steps ───────────────────────────────────────────────────────────────────

export interface ActionStep {
  id: string;
  type: 'action';
  node: string;
  params: Record<string, unknown>;
  onError?: 'skip' | 'fail' | 'retry';
  maxRetries?: number;
}

export interface ConditionStep {
  id: string;
  type: 'condition';
  /** JSONata / simple expression; context vars available as {{varName}} */
  expression: string;
  then: FlowStep[];
  else?: FlowStep[];
}

export interface DelayStep {
  id: string;
  type: 'delay';
  delayMs: number;
}

export interface ApprovalStep {
  id: string;
  type: 'approval';
  message: string;
  timeoutMs?: number;
  onTimeout?: 'approve' | 'reject' | 'fail';
}

export interface BranchStep {
  id: string;
  type: 'branch';
  expression: string;
  cases: Array<{ value: string; steps: FlowStep[] }>;
  default?: FlowStep[];
}

export type FlowStep =
  | ActionStep
  | ConditionStep
  | DelayStep
  | ApprovalStep
  | BranchStep;

// ─── Flow ────────────────────────────────────────────────────────────────────

export interface IntegraxFlow {
  id: string;
  name: string;
  description?: string;
  version: string;
  trigger: FlowTrigger;
  steps: FlowStep[];
  /** tenantId; undefined = platform-level flow */
  tenantId?: string;
  enabled?: boolean;
  tags?: string[];
}

// ─── Validation ──────────────────────────────────────────────────────────────

export interface ValidationError {
  path: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}
