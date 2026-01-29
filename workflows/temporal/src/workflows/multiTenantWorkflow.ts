// Multi-tenant workflow wrapper (base)
import type { OrderWorkflowInput, OrderWorkflowOutput } from './order-workflow.js';
import type { PaymentWorkflowInput, PaymentWorkflowOutput } from './payment-workflow.js';

export type MultiTenantWorkflowInput = {
  tenantId: string;
  workflowType: 'order' | 'payment';
  payload: OrderWorkflowInput | PaymentWorkflowInput;
};

export type MultiTenantWorkflowOutput = {
  tenantId: string;
  workflowType: 'order' | 'payment';
  result: OrderWorkflowOutput | PaymentWorkflowOutput;
};

// Wrapper para ejecutar workflows con aislamiento multi-tenant
export async function multiTenantWorkflow(input: MultiTenantWorkflowInput): Promise<MultiTenantWorkflowOutput> {
  // En producción, validar tenant, límites, suspensión, etc.
  if (input.workflowType === 'order') {
    const mod = await import('./order-workflow');
    const orderWorkflow = mod.orderWorkflow as (input: OrderWorkflowInput) => Promise<OrderWorkflowOutput>;
    const result = await orderWorkflow(input.payload as OrderWorkflowInput);
    return { tenantId: input.tenantId, workflowType: 'order', result };
  } else if (input.workflowType === 'payment') {
    const mod = await import('./payment-workflow');
    const paymentWorkflow = mod.paymentWorkflow as (input: PaymentWorkflowInput) => Promise<PaymentWorkflowOutput>;
    const result = await paymentWorkflow(input.payload as PaymentWorkflowInput);
    return { tenantId: input.tenantId, workflowType: 'payment', result };
  }
  throw new Error('Invalid workflow type');
}
