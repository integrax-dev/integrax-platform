/** Contrato interno de output de un run — no depende del formato del engine subyacente. */
export interface FlowRunOutput {
  result?: unknown;
  error?: string;
}

export interface FlowRun {
  runId: string;
  status: 'running' | 'succeeded' | 'failed' | 'paused';
  output?: FlowRunOutput;
  startedAt: string;
  finishedAt?: string;
}

export interface Flow {
  id: string;
  name: string;
  tenantId: string;
  enabled: boolean;
}

export interface TriggerFlowInput {
  flowId: string;
  tenantId: string;
  payload: Record<string, unknown>;
}

/**
 * Traduce IDs internos de IntegraX a IDs del engine subyacente.
 * Por defecto es passthrough (identidad).
 * Sobrescribir cuando tenantId ≠ projectId o flowId ≠ flowVersionId en el engine.
 */
export interface IdMapper {
  /** Convierte un flowId interno al ID que usa el engine. */
  flowId?: (tenantId: string, internalFlowId: string) => string;
  /** Convierte un tenantId al projectId (o equivalente) del engine. */
  projectId?: (tenantId: string) => string;
}

export interface IntegrationEngine {
  triggerFlow(input: TriggerFlowInput): Promise<{ runId: string }>;
  getRunStatus(tenantId: string, runId: string): Promise<FlowRun>;
  cancelRun(tenantId: string, runId: string): Promise<void>;
  listFlows(tenantId: string): Promise<Flow[]>;
  enableFlow(tenantId: string, flowId: string): Promise<void>;
  disableFlow(tenantId: string, flowId: string): Promise<void>;
}
