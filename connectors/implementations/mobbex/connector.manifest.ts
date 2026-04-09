import type { ConnectorManifest } from '@integrax/connector-sdk';

/**
 * Mobbex — Argentina
 *
 * Capabilities: create/refund/cancel payments, checkout link, subscriptions, marketplace split.
 * Does NOT support authorize/capture two-step or QR payments (not officially documented).
 */
const manifest = {
  service: 'mobbex',

  auth: { type: 'api_key' as const },

  capabilities: ['read', 'write', 'webhook_inbound', 'payments'] as const,

  webhooks_supported: true,
  polling_supported: false,
  cursor_fields: [],
  entities_supported: ['payment', 'subscription', 'refund'],

  payment_capabilities: [
    'create_payment',
    'refund_payment',
    'cancel_payment',
    'create_subscription',
    'cancel_subscription',
    'create_checkout_link',
    'create_split_payment',
    'reconcile_payment',
  ] as const,

  operations: {
    create_checkout: true,     // Mobbex checkout session (returns checkout URL)
    get_payment: true,
    refund_payment: true,
    cancel_payment: true,
    create_subscription: true,
    cancel_subscription: true,
  },

  entities: {
    payment: {
      source: 'payments',
      identity: {
        primary: ['id'],
        fallback: ['reference'],
      },
      fields: {
        externalId:          'id',
        amount:              'total',
        currency:            'currency',
        status:              'status',
        transactionReference: 'reference',
        checkoutUrl:         'url',
        updatedAt:           'updated_at',
      },
    },
    subscription: {
      source: 'subscriptions',
      identity: {
        primary: ['id'],
        fallback: ['reference'],
      },
      fields: {
        externalId:   'id',
        status:       'status',
        amount:       'total',
        currency:     'currency',
        customerId:   'customer',
        updatedAt:    'updated_at',
      },
    },
  },

  drift: {
    endpoints: ['payments'],
  },
} satisfies ConnectorManifest;

export default manifest;
