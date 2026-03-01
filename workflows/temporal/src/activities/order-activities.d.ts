export interface CreateOrderInput {
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
}
export interface ProcessPaymentInput {
    orderId: string;
    tenantId: string;
    amount: number;
    currency: string;
    method: string;
    customer: {
        email: string;
        name: string;
    };
}
export interface GenerateInvoiceInput {
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
}
export interface SendOrderConfirmationInput {
    orderId: string;
    tenantId: string;
    customer: {
        email: string;
        name: string;
    };
    items: Array<{
        productId: string;
        name: string;
        quantity: number;
        unitPrice: number;
    }>;
    totalAmount: number;
    currency: string;
    invoiceId?: string;
    paymentId?: string;
}
export interface UpdateInventoryInput {
    tenantId: string;
    items: Array<{
        productId: string;
        quantity: number;
    }>;
    action: 'increase' | 'decrease';
}
export interface PublishOrderEventInput {
    orderId: string;
    tenantId: string;
    correlationId: string;
    eventType: string;
    data: Record<string, unknown>;
}
/**
 * Create order in database
 */
export declare function createOrder(input: CreateOrderInput): Promise<{
    orderId: string;
}>;
/**
 * Process payment for order
 */
export declare function processPayment(input: ProcessPaymentInput): Promise<{
    paymentId: string;
    status: string;
}>;
/**
 * Generate invoice for order
 */
export declare function generateInvoice(input: GenerateInvoiceInput): Promise<{
    invoiceId: string;
    invoiceNumber: string;
}>;
/**
 * Send order confirmation email
 */
export declare function sendOrderConfirmation(input: SendOrderConfirmationInput): Promise<void>;
/**
 * Update inventory
 */
export declare function updateInventory(input: UpdateInventoryInput): Promise<void>;
/**
 * Publish order event to Kafka
 */
export declare function publishOrderEvent(input: PublishOrderEventInput): Promise<void>;
