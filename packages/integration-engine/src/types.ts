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
 * Sobrescribir cuando el tenantId interno no coincide con el identificador de tenant
 * que usa el engine (project, workspace, organization, etc.), o cuando el flowId
 * interno no coincide con el ID de flow del engine.
 */
export interface IdMapper {
  /** Convierte un flowId interno al ID que usa el engine. */
  flowId?: (tenantId: string, internalFlowId: string) => string;
  /**
   * Convierte un tenantId interno al identificador de "tenant" del engine.
   * El nombre del concepto varía según el engine: project (Activepieces),
   * workspace (n8n), organization (Zapier), etc.
   */
  tenantRef?: (tenantId: string) => string;
}

export interface IntegrationEngine {
  triggerFlow(input: TriggerFlowInput): Promise<{ runId: string }>;
  getRunStatus(tenantId: string, runId: string): Promise<FlowRun>;
  cancelRun(tenantId: string, runId: string): Promise<void>;
  listFlows(tenantId: string): Promise<Flow[]>;
  enableFlow(tenantId: string, flowId: string): Promise<void>;
  disableFlow(tenantId: string, flowId: string): Promise<void>;
}
