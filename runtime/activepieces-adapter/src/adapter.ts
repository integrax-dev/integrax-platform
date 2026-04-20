import { ActivepiecesAdapter } from '@integrax/integration-engine';
import type { TriggerFlowInput, FlowRun, IdMapper } from '@integrax/integration-engine';
import type { IntegraxFlow } from '@integrax/workflow-engine';
import { compileFlow } from './compiler.js';
import type { RuntimeAdapter, ActivepiecesFlowJSON } from './types.js';

export interface ActivepiecesRuntimeConfig {
  baseUrl: string;
  apiKey: string;
  idMapper?: IdMapper;
}

/**
 * RuntimeAdapter implementation backed by Activepieces.
 *
 * Wraps the existing `ActivepiecesAdapter` from `@integrax/integration-engine`
 * and adds `compileFlow()` — the bridge between IntegraX flow specs and the AP JSON format.
 */
export class ActivepiecesRuntimeAdapter implements RuntimeAdapter {
  private readonly engine: ActivepiecesAdapter;

  constructor(config: ActivepiecesRuntimeConfig) {
    this.engine = new ActivepiecesAdapter(config.baseUrl, config.apiKey, config.idMapper);
  }

  compileFlow(flow: IntegraxFlow): ActivepiecesFlowJSON {
    return compileFlow(flow);
  }

  async executeFlow(input: TriggerFlowInput): Promise<{ runId: string }> {
    return this.engine.triggerFlow(input);
  }

  async getRunStatus(tenantId: string, runId: string): Promise<FlowRun> {
    return this.engine.getRunStatus(tenantId, runId);
  }

  async cancelRun(tenantId: string, runId: string): Promise<void> {
    return this.engine.cancelRun(tenantId, runId);
  }
}
