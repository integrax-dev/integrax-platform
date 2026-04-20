import type { ModuleHandlerDef } from './_types.js';
import { paymentsService } from '../modules.js';
import type {
  CreatePaymentInput, AuthorizePaymentInput, CapturePaymentInput,
  RefundPaymentInput, CancelPaymentInput, TokenizePaymentMethodInput,
  CreateSubscriptionInput, CancelSubscriptionInput, SendPaymentReminderInput,
  ReconcilePaymentInput, PaymentStatus,
} from '@integrax/module-payments';

export const moduleId = 'payments';

export const handle: ModuleHandlerDef['handle'] = async (_tenantId, action, payload) => {
  const p = payload as Record<string, unknown>;
  switch (action) {
    case 'create_payment':
      return paymentsService.createPayment(
        p['input'] as CreatePaymentInput,
        p['externalId'] as string,
        p['initialStatus'] as PaymentStatus | undefined,
      );
    case 'authorize_payment':
      return paymentsService.authorizePayment(payload as AuthorizePaymentInput);
    case 'capture_payment':
      return paymentsService.capturePayment(payload as CapturePaymentInput);
    case 'refund_payment':
      return paymentsService.refundPayment(
        p['input'] as RefundPaymentInput,
        p['externalRefundId'] as string,
      );
    case 'cancel_payment':
      return paymentsService.cancelPayment(payload as CancelPaymentInput);
    case 'tokenize_payment_method':
      return paymentsService.tokenizePaymentMethod(
        p['input'] as TokenizePaymentMethodInput,
        p['pspToken'] as string,
        p['details'] as Record<string, string>,
      );
    case 'create_subscription':
      return paymentsService.createSubscription(
        p['input'] as CreateSubscriptionInput,
        p['externalId'] as string,
      );
    case 'cancel_subscription':
      return paymentsService.cancelSubscription(payload as CancelSubscriptionInput);
    case 'send_payment_reminder':
      return paymentsService.sendPaymentReminder(payload as SendPaymentReminderInput);
    case 'reconcile_payment':
      return paymentsService.reconcilePayment(
        p['input'] as ReconcilePaymentInput,
        p['livePayment'] as never,
      );
    default:
      throw new Error(`payments: unknown action '${action}'`);
  }
};
