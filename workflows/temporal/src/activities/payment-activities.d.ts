export interface ValidatePaymentInput {
    paymentId: string;
    tenantId: string;
}
export interface PaymentData {
    id: string;
    status: string;
    amount: number;
    currency: string;
    payerEmail?: string;
    payerName?: string;
    paymentMethod: string;
    createdAt: string;
}
export interface PersistPaymentInput {
    paymentId: string;
    tenantId: string;
    correlationId: string;
    paymentData: PaymentData;
}
export interface PublishPaymentEventInput {
    paymentId: string;
    tenantId: string;
    correlationId: string;
    status: string;
    eventType: string;
}
export interface SyncToGoogleSheetsInput {
    paymentId: string;
    tenantId: string;
    paymentData: PaymentData;
}
export interface SendNotificationInput {
    tenantId: string;
    type: string;
    data: Record<string, unknown>;
}
/**
 * Validate payment with MercadoPago API
 */
export declare function validatePayment(input: ValidatePaymentInput): Promise<PaymentData>;
/**
 * Persist payment to database
 */
export declare function persistPayment(input: PersistPaymentInput): Promise<void>;
/**
 * Publish payment event to Kafka
 */
export declare function publishPaymentEvent(input: PublishPaymentEventInput): Promise<void>;
/**
 * Sync payment to Google Sheets
 */
export declare function syncToGoogleSheets(input: SyncToGoogleSheetsInput): Promise<void>;
/**
 * Send notification to tenant
 */
export declare function sendNotification(input: SendNotificationInput): Promise<void>;
