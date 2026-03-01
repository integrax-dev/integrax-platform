// Orquestación multi-tenant: conecta LLM Orchestrator con workflows multi-tenant
import { Orchestrator, createOrchestrator } from './orchestrator';
import { multiTenantWorkflow, MultiTenantWorkflowInput, MultiTenantWorkflowOutput } from '@integrax/temporal-workflows';
import type { OrchestratorConfig, ParsedIntent, GeneratedWorkflow } from './types';

export class MultiTenantIntegrator {
  private orchestrator: Orchestrator;
  constructor(config: OrchestratorConfig) {
    this.orchestrator = createOrchestrator(config);
  }

  async processIntent(tenantId: string, message: string): Promise<MultiTenantWorkflowOutput | null> {
    // 1. Parsear intención y generar workflow
    const parsed: ParsedIntent = await this.orchestrator.parseIntent(message);
    if (!parsed || !parsed.intent || parsed.intent === 'unknown') return null;
    // 2. Generar workflow (mock: usar intent como tipo)
    const workflowType = parsed.intent === 'process_payment' ? 'payment' : 'order';
    let payload: MultiTenantWorkflowInput['payload'];
    if (workflowType === 'payment') {
      payload = { tenantId, ...parsed.entities } as import('@integrax/temporal-workflows').PaymentWorkflowInput;
    } else {
      payload = { tenantId, ...parsed.entities } as import('@integrax/temporal-workflows').OrderWorkflowInput;
    }
    const input: MultiTenantWorkflowInput = { tenantId, workflowType, payload };
    // 3. Ejecutar workflow multi-tenant
    return await multiTenantWorkflow(input);
  }
}
