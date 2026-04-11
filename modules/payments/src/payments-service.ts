/**
 * PaymentsService
 *
 * Top-level façade that composes PaymentService, PaymentMethodService,
 * SubscriptionService, ReminderService, and PaymentReconciliationService
 * into the PaymentsModule interface.
 *
 * Mutation methods (createPayment, refundPayment, etc.) are intended to be
 * called by the operation-engine dispatcher after command validation and
 * facade execution. They persist canonical state, emit events, and write
 * the timeline.
 *
 * Query methods (getPayment, listPayments, etc.) can be called directly
 * from routes without going through the operation-engine.
 */

import type { Payment, Refund, PaymentMethod, Subscription } from '@integrax/entities';
import type { EventBus } from '@integrax/event-bus';
import type { SnapshotStore } from '@integrax/snapshot-store';
import type { TimelineStore } from '@integrax/timeline';
import { PaymentService } from './payment-service.js';
import { PaymentMethodService } from './payment-method-service.js';
import { SubscriptionService } from './subscription-service.js';
import { ReminderService } from './reminder-service.js';
import { PaymentReconciliationService } from './reconciliation-service.js';
import type {
  PaymentsModule,
  CreatePaymentInput,
  AuthorizePaymentInput,
  CapturePaymentInput,
  RefundPaymentInput,
  CancelPaymentInput,
  TokenizePaymentMethodInput,
  CreateSubscriptionInput,
  CancelSubscriptionInput,
  CreateCheckoutLinkInput,
  GenerateQrPaymentInput,
  SendPaymentReminderInput,
  ReconcilePaymentInput,
  CheckoutLinkResult,
  QrPaymentResult,
  ReconciliationAnomaly,
  GetPaymentInput,
  ListPaymentsInput,
  GetSubscriptionInput,
  ListSubscriptionsInput,
  PaymentStatus,
} from './types.js';

export class PaymentsService implements PaymentsModule {
  private readonly paymentSvc: PaymentService;
  private readonly methodSvc: PaymentMethodService;
  private readonly subscriptionSvc: SubscriptionService;
  private readonly reminderSvc: ReminderService;
  private readonly reconciliationSvc: PaymentReconciliationService;

  constructor(
    store: SnapshotStore,
    bus: EventBus,
    timeline?: TimelineStore,
  ) {
    this.paymentSvc = new PaymentService(store, bus, timeline);
    this.methodSvc = new PaymentMethodService(store, bus, timeline);
    this.subscriptionSvc = new SubscriptionService(store, bus, timeline);
    this.reminderSvc = new ReminderService(bus, timeline);
    this.reconciliationSvc = new PaymentReconciliationService(store, bus, timeline);
  }

  // ─── Payment lifecycle ────────────────────────────────────────────────────

  /**
   * Called by the operation-engine after the connector facade creates the payment.
   * `externalId` is the PSP-assigned transaction ID returned by the facade.
   */
  async createPayment(
    input: CreatePaymentInput,
    externalId: string,
    initialStatus: PaymentStatus = 'pending',
  ): Promise<Payment & { canonicalId: string }> {
    return this.paymentSvc.createPaymentRecord(input.tenantId, input, externalId, initialStatus);
  }

  async authorizePayment(input: AuthorizePaymentInput): Promise<void> {
    await this.paymentSvc.updatePaymentStatus(
      input.tenantId, input.canonicalId, 'authorized', input.sourceSystem,
      { authorizedAt: new Date() },
    );
  }

  async capturePayment(input: CapturePaymentInput): Promise<void> {
    await this.paymentSvc.updatePaymentStatus(
      input.tenantId, input.canonicalId, 'captured', input.sourceSystem,
      { capturedAt: new Date() },
    );
  }

  async refundPayment(
    input: RefundPaymentInput,
    externalRefundId: string,
  ): Promise<Refund & { canonicalId: string }> {
    return this.paymentSvc.createRefundRecord(input.tenantId, input, externalRefundId);
  }

  async cancelPayment(input: CancelPaymentInput): Promise<void> {
    await this.paymentSvc.updatePaymentStatus(
      input.tenantId, input.canonicalId, 'cancelled', input.sourceSystem,
    );
  }

  async getPayment(input: GetPaymentInput): Promise<Payment | null> {
    return this.paymentSvc.getPayment(input);
  }

  async listPayments(input: ListPaymentsInput): Promise<Payment[]> {
    return this.paymentSvc.listPayments(input);
  }

  /** Ingest a payment update from a webhook or polling event. */
  async ingestPayment(
    tenantId: string,
    payment: Payment & { canonicalId: string },
  ): Promise<void> {
    return this.paymentSvc.ingestPayment(tenantId, payment);
  }

  // ─── Payment methods ──────────────────────────────────────────────────────

  async tokenizePaymentMethod(
    input: TokenizePaymentMethodInput,
    pspToken: string,
    details: Partial<PaymentMethod> = {},
  ): Promise<PaymentMethod & { canonicalId: string }> {
    return this.methodSvc.createFromTokenization(input.tenantId, input, pspToken, details);
  }

  // ─── Subscriptions ────────────────────────────────────────────────────────

  async createSubscription(
    input: CreateSubscriptionInput,
    externalId: string,
  ): Promise<Subscription & { canonicalId: string }> {
    return this.subscriptionSvc.createSubscriptionRecord(input.tenantId, input, externalId);
  }

  async cancelSubscription(input: CancelSubscriptionInput): Promise<void> {
    return this.subscriptionSvc.cancelSubscriptionRecord(input.tenantId, input);
  }

  async getSubscription(input: GetSubscriptionInput): Promise<Subscription | null> {
    return this.subscriptionSvc.getSubscription(input);
  }

  async listSubscriptions(input: ListSubscriptionsInput): Promise<Subscription[]> {
    return this.subscriptionSvc.listSubscriptions(input);
  }

  // ─── Checkout & QR ───────────────────────────────────────────────────────
  // These methods return data from the facade; the module only records the action.

  async createCheckoutLink(_input: CreateCheckoutLinkInput): Promise<CheckoutLinkResult> {
    // Actual URL comes from the facade via operation-engine dispatcher.
    // This stub signals that the module contract requires it.
    throw new Error('createCheckoutLink must be invoked via operation-engine command, not directly');
  }

  async generateQrPayment(_input: GenerateQrPaymentInput): Promise<QrPaymentResult> {
    throw new Error('generateQrPayment must be invoked via operation-engine command, not directly');
  }

  // ─── Reminders ────────────────────────────────────────────────────────────

  async sendPaymentReminder(input: SendPaymentReminderInput): Promise<void> {
    return this.reminderSvc.sendPaymentReminder(input);
  }

  // ─── Reconciliation ───────────────────────────────────────────────────────

  async reconcilePayment(
    input: ReconcilePaymentInput,
    livePayment: Payment,
  ): Promise<ReconciliationAnomaly[]> {
    return this.reconciliationSvc.reconcilePayment(input, livePayment);
  }

  async scanForAnomalies(tenantId: string): Promise<ReconciliationAnomaly[]> {
    return this.reconciliationSvc.scanForAnomalies(tenantId);
  }
}
