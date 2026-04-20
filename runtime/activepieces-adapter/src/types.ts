import type { IntegraxFlow, FlowStep, ActionStep, ConditionStep } from '@integrax/workflow-engine';
import type { FlowRun, TriggerFlowInput } from '@integrax/integration-engine';

export type { FlowRun };

/** Compiled Activepieces flow JSON — minimal shape for what the AP API needs. */
export interface ActivepiecesFlowJSON {
  displayName: string;
  trigger: ActivepiecesTrigger;
  actions: ActivepiecesAction[];
}

export interface ActivepiecesTrigger {
  type: 'WEBHOOK' | 'SCHEDULE' | 'MANUAL';
  settings: Record<string, unknown>;
}

export interface ActivepiecesAction {
  name: string;
  displayName: string;
  type: 'CODE' | 'BRANCH' | 'LOOP_ON_ITEMS';
  settings: Record<string, unknown>;
  nextAction?: ActivepiecesAction;
  onFailureAction?: ActivepiecesAction;
}

/** Public surface for any runtime adapter — callers use this, not the concrete class. */
export interface RuntimeAdapter {
  /**
   * Compile an IntegraX flow spec to the engine's native JSON format.
   * Returns the compiled JSON; does NOT deploy it.
   */
  compileFlow(flow: IntegraxFlow): ActivepiecesFlowJSON;

  /**
   * Trigger execution of an already-deployed flow.
   * Returns a runId that can be polled with `getRunStatus`.
   */
  executeFlow(input: TriggerFlowInput): Promise<{ runId: string }>;

  /** Poll execution status. */
  getRunStatus(tenantId: string, runId: string): Promise<FlowRun>;

  /** Cancel an in-progress run. */
  cancelRun(tenantId: string, runId: string): Promise<void>;
}

// Re-export so callers don't need to import from workflow-engine separately
export type { IntegraxFlow, FlowStep, ActionStep, ConditionStep };
