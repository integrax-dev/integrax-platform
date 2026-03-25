import type { IntegrationEngine, TriggerFlowInput, FlowRun, FlowRunOutput, Flow, IdMapper } from '../types.js';
import { ActivepiecesApiClient } from './api-client.js';
import { IntegrationEngineError } from '../errors.js';

interface ApFlowRun {
  id: string;
  projectId?: string; // presente en la respuesta — usado para verificar aislamiento de tenant
  status: 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'PAUSED' | 'STOPPED' | 'TIMEOUT';
  startTime: string;
  finishTime?: string;
  tasks?: Array<{ output?: unknown; error?: string }>;
}

interface ApFlow {
  id: string;
  status: 'ENABLED' | 'DISABLED';
  version: { displayName: string };
}

interface ApFlowPage {
  data: ApFlow[];
  next?: string;
}

export class ActivepiecesAdapter implements IntegrationEngine {
  private readonly client: ActivepiecesApiClient;
  private readonly idMapper: Required<IdMapper>;

  constructor(baseUrl: string, apiKey: string, idMapper: IdMapper = {}) {
    this.client = new ActivepiecesApiClient(baseUrl, apiKey);
    this.idMapper = {
      flowId: idMapper.flowId ?? ((_tenantId, id) => id),
      projectId: idMapper.projectId ?? ((id) => id),
    };
  }

  async triggerFlow({ flowId, tenantId, payload }: TriggerFlowInput): Promise<{ runId: string }> {
    const run = await this.client.post<ApFlowRun>('/v1/flow-runs', {
      flowVersionId: this.idMapper.flowId(tenantId, flowId),
      projectId: this.idMapper.projectId(tenantId),
      payload,
    });
    return { runId: run.id };
  }

  async getRunStatus(tenantId: string, runId: string): Promise<FlowRun> {
    const expectedProjectId = this.idMapper.projectId(tenantId);
    const run = await this.client.get<ApFlowRun>(
      `/v1/flow-runs/${runId}?projectId=${expectedProjectId}`,
    );

    // Tenant isolation: si el engine devuelve el projectId del run, verificar que coincida.
    // Previene que un tenant consulte runs de otro tenant si el engine no lo rechaza por sí solo.
    if (run.projectId && run.projectId !== expectedProjectId) {
      throw new IntegrationEngineError(
        `Run ${runId} does not belong to tenant ${tenantId}`,
        403,
      );
    }

    return {
      runId: run.id,
      status: this.mapStatus(run.status),
      output: this.extractOutput(run),
      startedAt: run.startTime,
      finishedAt: run.finishTime,
    };
  }

  async cancelRun(tenantId: string, runId: string): Promise<void> {
    await this.client.post(
      `/v1/flow-runs/${runId}/requests/stop?projectId=${this.idMapper.projectId(tenantId)}`,
      {},
    );
  }

  async listFlows(tenantId: string): Promise<Flow[]> {
    const flows: Flow[] = [];
    let path = `/v1/flows?projectId=${this.idMapper.projectId(tenantId)}&limit=100`;

    while (path) {
      const page = await this.client.get<ApFlowPage>(path);
      for (const f of page.data) {
        flows.push({
          id: f.id,
          name: f.version.displayName,
          tenantId,
          enabled: f.status === 'ENABLED',
        });
      }
      path = page.next
        ? `/v1/flows?projectId=${this.idMapper.projectId(tenantId)}&limit=100&cursor=${page.next}`
        : '';
    }

    return flows;
  }

  async enableFlow(tenantId: string, flowId: string): Promise<void> {
    await this.client.patch(
      `/v1/flows/${this.idMapper.flowId(tenantId, flowId)}?projectId=${this.idMapper.projectId(tenantId)}`,
      { status: 'ENABLED' },
    );
  }

  async disableFlow(tenantId: string, flowId: string): Promise<void> {
    await this.client.patch(
      `/v1/flows/${this.idMapper.flowId(tenantId, flowId)}?projectId=${this.idMapper.projectId(tenantId)}`,
      { status: 'DISABLED' },
    );
  }

  private extractOutput(run: ApFlowRun): FlowRunOutput | undefined {
    if (!run.tasks?.length) return undefined;
    const last = run.tasks[run.tasks.length - 1];
    return {
      result: last.output,
      error: last.error,
    };
  }

  private mapStatus(ap: ApFlowRun['status']): FlowRun['status'] {
    const map: Record<ApFlowRun['status'], FlowRun['status']> = {
      RUNNING: 'running',
      SUCCEEDED: 'succeeded',
      FAILED: 'failed',
      PAUSED: 'paused',
      STOPPED: 'failed',
      TIMEOUT: 'failed',
    };
    return map[ap] ?? 'failed';
  }
}
