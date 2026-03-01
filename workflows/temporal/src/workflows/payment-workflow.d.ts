export interface PaymentWorkflowInput {
    paymentId: string;
    tenantId: string;
    correlationId: string;
    source: 'webhook' | 'api' | 'cdc';
}
export interface PaymentWorkflowOutput {
    success: boolean;
    paymentId: string;
    status: string;
    processedAt: string;
    steps: StepResult[];
}
export interface StepResult {
    step: string;
    success: boolean;
    duration: number;
    error?: string;
}
export declare const cancelPaymentSignal: import("@temporalio/workflow").SignalDefinition<[string], string>;
export declare const retryStepSignal: import("@temporalio/workflow").SignalDefinition<[string], string>;
export declare function paymentWorkflow(input: PaymentWorkflowInput): Promise<PaymentWorkflowOutput>;
