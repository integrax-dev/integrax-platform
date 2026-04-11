import { createEngine } from '@integrax/integration-engine';
import type { IntegraxFlow } from '@integrax/workflow-engine';
import type {
  RuntimeAdapter,
  CompiledFlowRef,
  ExecuteFlowInput,
  FlowExecutionResult,
  ExecutionStatus,
} from './runtime-adapter.js';
import { compileFlow } from './compile.js';
import type { IntegrationEngine, FlowRun } from '@integrax/integration-engine';

/**
 * RuntimeAdapter respaldado por Activepieces.
 *
 * Envuelve `@integrax/integration-engine` (que ya resuelve la capa HTTP)
 * y encima le agrega la compilacion de flujos de Integrax.
 *
 * Para reemplazar el runtime hay que implementar `RuntimeAdapter` y cambiar
 * esta clase. Quien llama debe depender de `RuntimeAdapter`, no de
 * `ActivepiecesRuntimeAdapter`.
 */
export class ActivepiecesRuntimeAdapter implements RuntimeAdapter {
  private readonly engine: IntegrationEngine;
  /** Mapa en memoria de internalFlowId -> runtimeFlowId (flow version ID de AP). */
  private readonly compiledFlows = new Map<string, CompiledFlowRef>();

  constructor(engine?: IntegrationEngine) {
    this.engine = engine ?? createEngine();
  }

  async compileFlow(flow: IntegraxFlow): Promise<CompiledFlowRef> {
    // La compilacion produce el JSON de AP; registrarlo en el servidor AP
    // requiere una llamada de API. Por ahora guardamos la spec compilada y
    // usamos el flowId interno como runtimeFlowId.
    // AP debe estar preconfigurado con IDs equivalentes, o el IdMapper del
    // integration-engine se encarga de traducirlos.
    compileFlow(flow); // valida que el flujo compile sin error

    const ref: CompiledFlowRef = {
      flowId: flow.id,
      runtimeFlowId: flow.id, // IdMapper en createEngine() traduce en runtime
      compiledAt: new Date(),
    };
    this.compiledFlows.set(flow.id, ref);
    return ref;
  }

  async executeFlow(input: ExecuteFlowInput): Promise<FlowExecutionResult> {
    const { runId } = await this.engine.triggerFlow({
      flowId: input.flowId,
      tenantId: input.tenantId,
      payload: input.payload,
    });

    return {
      executionId: runId,
      flowId: input.flowId,
      tenantId: input.tenantId,
      status: 'running',
      startedAt: new Date(),
    };
  }

  async getExecutionStatus(tenantId: string, executionId: string): Promise<FlowExecutionResult> {
    const run = await this.engine.getRunStatus(tenantId, executionId);
    return this.mapRun(run, tenantId);
  }

  async cancelExecution(tenantId: string, executionId: string): Promise<void> {
    await this.engine.cancelRun(tenantId, executionId);
  }

  private mapRun(run: FlowRun, tenantId: string): FlowExecutionResult {
    const statusMap: Record<FlowRun['status'], ExecutionStatus> = {
      running: 'running',
      succeeded: 'succeeded',
      failed: 'failed',
      paused: 'waiting_approval',
    };
    return {
      executionId: run.runId,
      flowId: run.runId, // AP no expone flowId en la corrida; usamos runId como placeholder
      tenantId,
      status: statusMap[run.status] ?? 'failed',
      output: run.output?.result,
      error: run.output?.error,
      startedAt: new Date(run.startedAt),
      completedAt: run.finishedAt ? new Date(run.finishedAt) : undefined,
    };
  }
}
