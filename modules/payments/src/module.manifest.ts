export const moduleManifest = {
  id: 'payments',
  name: 'Payments',
  version: '0.1.0',
  description: 'Neutral payment capability layer — create, capture, refund, tokenize, subscribe, reconcile across any PSP',
  requiredEntities: ['payment', 'payment_method', 'subscription', 'refund'],
  requiredPackages: ['@integrax/snapshot-store', '@integrax/event-bus', '@integrax/timeline'],
  /**
   * Events emitted by this module.
   * These are a subset of the full payment event taxonomy defined in event-bus/event-types.ts.
   */
  emittedEvents: [
    'payment.created',
    'payment.updated',
    'payment.authorized',
    'payment.captured',
    'payment.approved',
    'payment.failed',
    'payment.cancelled',
    'payment.refunded',
    'payment.partially_refunded',
    'payment.chargeback',
    'payment.expired',
    'payment.reconciliation_failed',
    'payment.method.tokenized',
    'payment.reminder.sent',
    'subscription.created',
    'subscription.updated',
    'subscription.activated',
    'subscription.past_due',
    'subscription.cancelled',
    'subscription.expired',
  ],
  consumedEvents: ['webhook.received'],
  /**
   * Operation-engine capabilities required by at least one connector to use this module.
   * Not all connectors need to support every capability.
   */
  paymentCapabilities: [
    'create_payment',
    'authorize_payment',
    'capture_payment',
    'refund_payment',
    'cancel_payment',
    'tokenize_payment_method',
    'create_subscription',
    'cancel_subscription',
    'create_checkout_link',
    'generate_qr_payment',
    'reconcile_payment',
    'send_payment_reminder',
  ],
  /**
   * Profiles that commonly include this module.
   * The module is NOT restricted to these profiles.
   */
  usedByProfiles: ['ecommerce', 'accounting', 'education', 'legal', 'healthcare', 'services'],
} as const;
