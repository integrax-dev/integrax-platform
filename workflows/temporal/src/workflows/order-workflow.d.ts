/**
 * Order Fulfillment Workflow
 *
 * Orquesta el flujo completo de una orden:
 * 1. Crear orden
 * 2. Esperar confirmación de pago
 * 3. Generar factura
 * 4. Notificar al cliente
 * 5. Actualizar inventario (futuro)
 */
export interface OrderWorkflowInput {
    orderId: string;
    tenantId: string;
    correlationId: string;
    customer: {
        email: string;
        name: string;
        taxId?: string;
    };
    items: Array<{
        productId: string;
        name: string;
        quantity: number;
        unitPrice: number;
    }>;
    totalAmount: number;
    currency: string;
    paymentMethod?: string;
}
export interface OrderWorkflowOutput {
    success: boolean;
    orderId: string;
    status: OrderStatus;
    invoiceId?: string;
    paymentId?: string;
    processedAt: string;
    timeline: TimelineEvent[];
}
export type OrderStatus = 'created' | 'payment_pending' | 'payment_received' | 'invoiced' | 'completed' | 'cancelled' | 'failed';
export interface TimelineEvent {
    event: string;
    timestamp: string;
    data?: Record<string, unknown>;
}
export declare const paymentReceivedSignal: import("@temporalio/workflow").SignalDefinition<[{
    paymentId: string;
    amount: number;
}], string>;
export declare const cancelOrderSignal: import("@temporalio/workflow").SignalDefinition<[string], string>;
export declare const getOrderStatusQuery: import("@temporalio/workflow").QueryDefinition<{
    status: OrderStatus;
    timeline: TimelineEvent[];
}, [], string>;
export declare function orderWorkflow(input: OrderWorkflowInput): Promise<OrderWorkflowOutput>;
