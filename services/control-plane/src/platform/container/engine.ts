/**
 * Operation Engine + Approval Policy
 *
 * Wires commandRegistry, facadeResolver, all stores, and the event/timeline/snapshot
 * integration into a single OperationEngine instance.
 *
 * Also wires the ApprovalService notification: when an operation enters
 * 'awaiting_approval', we emit a 'conflict.detected' event so the notification
 * layer can alert the relevant approvers.
 */

import {
  OperationEngine,
  ApprovalPolicy,
  Validator,
} from '@integrax/operation-engine';
import {
  snapshotStore,
  operationStore,
  attemptStore,
  approvalStore,
  idempotencyStore,
} from './stores.js';
import { eventBus } from './event-bus.js';
import { timelineStore } from './stores.js';
import { commandRegistry } from './commands.js';
import { facadeResolver } from './connectors.js';
import { billingService, inventoryService, paymentsService, ecommerceService } from './modules.js';
import type { CreateInvoiceInput } from '@integrax/module-billing';
import type { UpdateStockInput } from '@integrax/module-inventory';
import type {
  CreatePaymentInput, AuthorizePaymentInput, CapturePaymentInput,
  RefundPaymentInput, CancelPaymentInput, TokenizePaymentMethodInput,
  CreateSubscriptionInput, CancelSubscriptionInput, SendPaymentReminderInput,
  ReconcilePaymentInput,
} from '@integrax/module-payments';

// ─── Validator ────────────────────────────────────────────────────────────────

const operationValidator = new Validator({
  capabilityMap: {
    // PSP connectors — generic + payment-specific capabilities
    mercadopago: [
      'create_record', 'update_record', 'sync_record',
      'create_payment', 'authorize_payment', 'capture_payment',
      'refund_payment', 'cancel_payment', 'tokenize_payment_method',
      'create_subscription', 'cancel_subscription',
      'create_checkout_link', 'generate_qr_payment', 'reconcile_payment',
      'send_payment_reminder',
    ],
    payway: [
      'create_record', 'sync_record',
      'create_payment', 'capture_payment', 'refund_payment', 'cancel_payment',
      'tokenize_payment_method',
    ],
    mobbex: [
      'create_record', 'sync_record',
      'create_payment', 'refund_payment', 'cancel_payment',
      'create_checkout_link', 'reconcile_payment',
    ],
    decidir: [
      'create_record', 'sync_record',
      'create_payment', 'authorize_payment', 'capture_payment',
      'refund_payment', 'cancel_payment', 'tokenize_payment_method',
    ],
    // ERP / fiscal connectors
    contabilium: ['create_record', 'update_record', 'sync_record', 'create_document'],
    'afip-wsfe': ['create_document', 'approve_document'],
    // Utility connectors
    'google-sheets': ['create_record', 'update_record', 'sync_record'],
    email: ['send_notification'],
    whatsapp: ['send_notification'],
    // Module handlers (not connector facades)
    billing: ['create_document', 'sync_record'],
    inventory: ['update_record', 'sync_record'],
    orders: ['update_record', 'sync_record'],
    catalog: ['create_record', 'update_record', 'publish_record', 'archive_record'],
    ecommerce: ['create_record', 'sync_record'],
  },
  snapshotStore,
});

// ─── OperationEngine ──────────────────────────────────────────────────────────

export const operationEngine = new OperationEngine({
  commandRegistry,
  validator: operationValidator,
  operationStore,
  attemptStore,
  approvalStore,
  snapshotStore,
  eventBus,
  timelineStore,
  idempotencyStore,
  approvalPolicy: new ApprovalPolicy(),
  dispatcher: {
    resolveFacade: (connectorId, tenantId) => facadeResolver.resolve(connectorId, tenantId),
    moduleHandlers: {
      billing: async (_tenantId, action, payload) => {
        if (action === 'create_invoice') return billingService.createInvoice(payload as unknown as CreateInvoiceInput);
        throw new Error(`billing: unknown action '${action}'`);
      },
      inventory: async (_tenantId, action, payload) => {
        if (action === 'update_stock') return inventoryService.updateStock(payload as unknown as UpdateStockInput);
        throw new Error(`inventory: unknown action '${action}'`);
      },
      payments: async (_tenantId, action, payload) => {
        const p = payload as Record<string, unknown>;
        switch (action) {
          case 'create_payment':
            return paymentsService.createPayment(p['input'] as unknown as CreatePaymentInput, p['externalId'] as string, p['initialStatus'] as unknown as import('@integrax/module-payments').PaymentStatus | undefined);
          case 'authorize_payment':
            return paymentsService.authorizePayment(payload as unknown as AuthorizePaymentInput);
          case 'capture_payment':
            return paymentsService.capturePayment(payload as unknown as CapturePaymentInput);
          case 'refund_payment':
            return paymentsService.refundPayment(p['input'] as unknown as RefundPaymentInput, p['externalRefundId'] as string);
          case 'cancel_payment':
            return paymentsService.cancelPayment(payload as unknown as CancelPaymentInput);
          case 'tokenize_payment_method':
            return paymentsService.tokenizePaymentMethod(p['input'] as unknown as TokenizePaymentMethodInput, p['pspToken'] as string, p['details'] as Record<string, string>);
          case 'create_subscription':
            return paymentsService.createSubscription(p['input'] as unknown as CreateSubscriptionInput, p['externalId'] as string);
          case 'cancel_subscription':
            return paymentsService.cancelSubscription(payload as unknown as CancelSubscriptionInput);
          case 'send_payment_reminder':
            return paymentsService.sendPaymentReminder(payload as unknown as SendPaymentReminderInput);
          case 'reconcile_payment':
            return paymentsService.reconcilePayment(p['input'] as unknown as ReconcilePaymentInput, p['livePayment'] as never);
          default:
            throw new Error(`payments: unknown action '${action}'`);
        }
      },
      ecommerce: async (tenantId, action, payload) => {
        const p = payload as Record<string, unknown>;
        switch (action) {
          case 'ingest_catalog_item':
            return ecommerceService.ingestCatalogItem(tenantId, p['item'] as Parameters<typeof ecommerceService.ingestCatalogItem>[1]);
          case 'start_checkout':
            return ecommerceService.startCheckout(tenantId, p['cartId'] as string);
          case 'request_fulfillment':
            return ecommerceService.requestFulfillment(tenantId, p['request'] as Parameters<typeof ecommerceService.requestFulfillment>[1]);
          default:
            throw new Error(`ecommerce: unknown action '${action}'`);
        }
      },
    },
  },
  hooks: {
    beforeExecute: [],
    afterExecute: [],
    onFailure: [],
  },
});

// ─── Approval notifications ───────────────────────────────────────────────────
// When an operation enters 'awaiting_approval', emit a snapshot.updated event
// so downstream listeners (realtime / email / slack) can notify the approvers.

eventBus.subscribe('snapshot.updated', async (event) => {
  // This is a placeholder hook point. In production, check if the event
  // originates from an awaiting_approval status change and send notifications.
  void event;
});
