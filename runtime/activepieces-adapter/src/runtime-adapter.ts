import type { IntegraxFlow } from '@integrax/workflow-engine';

/**
 * RuntimeAdapter: interfaz que debe implementar cualquier runtime de workflows.
 *
 * Quien llama depende de esta interfaz, NO de tipos propios de Activepieces.
 * Cambiar de runtime implica cambiar la implementacion, no el contrato.
 */
export interface RuntimeAdapter {
  /**
   * Compila una definicion de flujo Integrax al formato nativo del runtime
   * y la registra. Devuelve el ID del flujo en ese runtime.
   */
  compileFlow(flow: IntegraxFlow): Promise<CompiledFlowRef>;

  /** Ejecuta un flujo previamente compilado. */
  executeFlow(input: ExecuteFlowInput): Promise<FlowExecutionResult>;

  /** Obtiene el estado actual de una ejecucion de flujo. */
  getExecutionStatus(tenantId: string, executionId: string): Promise<FlowExecutionResult>;

  /** Cancela una ejecucion en curso. */
  cancelExecution(tenantId: string, executionId: string): Promise<void>;
}

export interface CompiledFlowRef {
  /** ID interno del flujo Integrax. */
  flowId: string;
  /** ID nativo del runtime (flowVersionId de Activepieces, workflowId de n8n, etc.). */
  runtimeFlowId: string;
  compiledAt: Date;
}

export interface ExecuteFlowInput {
  /** ID del flujo Integrax, que mapea al flujo compilado del runtime. */
  flowId: string;
  tenantId: string;
  /** Payload disparador que entra al primer paso. */
  payload: Record<string, unknown>;
  correlationId?: string;
}

export type ExecutionStatus =
  | 'pending'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'waiting_approval';

export interface FlowExecutionResult {
  executionId: string;
  flowId: string;
  tenantId: string;
  status: ExecutionStatus;
  output?: unknown;
  error?: string;
  startedAt: Date;
  completedAt?: Date;
}
