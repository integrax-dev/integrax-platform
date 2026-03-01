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
export declare function multiTenantWorkflow(input: MultiTenantWorkflowInput): Promise<MultiTenantWorkflowOutput>;
