import type {
  Payment, PaymentStatus, PaymentMethodType,
  PaymentMethod,
  Subscription, SubscriptionStatus,
  Refund,
} from '@integrax/entities';

export type {
  Payment, PaymentStatus, PaymentMethodType,
  PaymentMethod,
  Subscription, SubscriptionStatus,
  Refund,
};

// ─── Command inputs ───────────────────────────────────────────────────────────

export interface CreatePaymentInput {
  tenantId: string;
  sourceSystem: string;
  /** Target PSP connector (e.g. 'mercadopago', 'stripe'). */
  connectorId: string;
  amount: number;
  currency: string;
  methodType: PaymentMethodType;
  /** Reference to existing tokenized PaymentMethod canonical ID. */
  paymentMethodId?: string;
  orderId?: string;
  invoiceId?: string;
  subscriptionId?: string;
  installments?: number;
  description?: string;
  statementDescriptor?: string;
  idempotencyKey?: string;
  metadata?: Record<string, unknown>;
}

export interface AuthorizePaymentInput {
  tenantId: string;
  canonicalId: string;
  sourceSystem: string;
  connectorId: string;
}

export interface CapturePaymentInput {
  tenantId: string;
  canonicalId: string;
  sourceSystem: string;
  connectorId: string;
  /** Partial capture amount. Omit for full capture. */
  amount?: number;
}

export interface RefundPaymentInput {
  tenantId: string;
  canonicalId: string;   // canonical Payment ID
  sourceSystem: string;
  connectorId: string;
  amount?: number;       // partial refund; omit for full
  reason?: Refund['reason'];
  note?: string;
  idempotencyKey?: string;
}

export interface CancelPaymentInput {
  tenantId: string;
  canonicalId: string;
  sourceSystem: string;
  connectorId: string;
  reason?: string;
}

export interface TokenizePaymentMethodInput {
  tenantId: string;
  sourceSystem: string;
  connectorId: string;
  /** Raw card / bank data as supplied by the PSP's front-end tokenizer. Never PAN. */
  token: string;
  customerId?: string;
  metadata?: Record<string, unknown>;
}

export interface CreateSubscriptionInput {
  tenantId: string;
  sourceSystem: string;
  connectorId: string;
  customerId?: string;
  paymentMethodId?: string;
  planId?: string;
  planName?: string;
  amount: number;
  currency: string;
  billingFrequency: Subscription['billingFrequency'];
  billingIntervalDays?: number;
  maxCycles?: number;
  startedAt?: Date;
  trialEndsAt?: Date;
  metadata?: Record<string, unknown>;
}

export interface CancelSubscriptionInput {
  tenantId: string;
  canonicalId: string;
  sourceSystem: string;
  connectorId: string;
  reason?: string;
}

export interface CreateCheckoutLinkInput {
  tenantId: string;
  sourceSystem: string;
  connectorId: string;
  amount: number;
  currency: string;
  description?: string;
  orderId?: string;
  invoiceId?: string;
  expiresAt?: Date;
  metadata?: Record<string, unknown>;
}

export interface GenerateQrPaymentInput {
  tenantId: string;
  sourceSystem: string;
  connectorId: string;
  amount: number;
  currency: string;
  description?: string;
  orderId?: string;
  expiresAt?: Date;
  metadata?: Record<string, unknown>;
}

export interface SendPaymentReminderInput {
  tenantId: string;
  sourceSystem: string;
  /** canonical Payment ID */
  paymentId: string;
  /** Channel to notify: 'email' | 'whatsapp' | 'sms' */
  channel: 'email' | 'whatsapp' | 'sms';
  recipientId?: string;
  recipientContact: string;  // email address or phone number
  message?: string;
}

export interface ReconcilePaymentInput {
  tenantId: string;
  canonicalId: string;
  sourceSystem: string;
  connectorId: string;
}

// ─── Query inputs ─────────────────────────────────────────────────────────────

export interface GetPaymentInput {
  tenantId: string;
  canonicalId: string;
}

export interface ListPaymentsInput {
  tenantId: string;
  status?: PaymentStatus;
  sourceSystem?: string;
  connectorId?: string;
  orderId?: string;
  invoiceId?: string;
  since?: Date;
  limit?: number;
}

export interface GetSubscriptionInput {
  tenantId: string;
  canonicalId: string;
}

export interface ListSubscriptionsInput {
  tenantId: string;
  status?: SubscriptionStatus;
  customerId?: string;
  sourceSystem?: string;
  limit?: number;
}

// ─── Result types ─────────────────────────────────────────────────────────────

export interface CheckoutLinkResult {
  url: string;
  expiresAt?: Date;
  metadata?: Record<string, unknown>;
}

export interface QrPaymentResult {
  qrData: string;      // raw QR string / dataURL
  qrImageUrl?: string;
  expiresAt?: Date;
  metadata?: Record<string, unknown>;
}

export interface ReconciliationAnomaly {
  type:
    | 'status_divergence'
    | 'amount_mismatch'
    | 'duplicate_payment'
    | 'missing_for_invoice'
    | 'refund_mismatch';
  canonicalId: string;
  sourceSystem: string;
  detail: string;
  detectedAt: Date;
}

// ─── Module interface ─────────────────────────────────────────────────────────

export interface PaymentsModule {
  // Payment lifecycle
  createPayment(input: CreatePaymentInput): Promise<Payment & { canonicalId: string }>;
  authorizePayment(input: AuthorizePaymentInput): Promise<void>;
  capturePayment(input: CapturePaymentInput): Promise<void>;
  refundPayment(input: RefundPaymentInput): Promise<Refund & { canonicalId: string }>;
  cancelPayment(input: CancelPaymentInput): Promise<void>;
  getPayment(input: GetPaymentInput): Promise<Payment | null>;
  listPayments(input: ListPaymentsInput): Promise<Payment[]>;

  // Payment methods
  tokenizePaymentMethod(input: TokenizePaymentMethodInput): Promise<PaymentMethod & { canonicalId: string }>;

  // Subscriptions
  createSubscription(input: CreateSubscriptionInput): Promise<Subscription & { canonicalId: string }>;
  cancelSubscription(input: CancelSubscriptionInput): Promise<void>;
  getSubscription(input: GetSubscriptionInput): Promise<Subscription | null>;
  listSubscriptions(input: ListSubscriptionsInput): Promise<Subscription[]>;

  // Checkout & QR
  createCheckoutLink(input: CreateCheckoutLinkInput): Promise<CheckoutLinkResult>;
  generateQrPayment(input: GenerateQrPaymentInput): Promise<QrPaymentResult>;

  // Reminders & reconciliation
  sendPaymentReminder(input: SendPaymentReminderInput): Promise<void>;
  reconcilePayment(input: ReconcilePaymentInput): Promise<ReconciliationAnomaly[]>;
}
