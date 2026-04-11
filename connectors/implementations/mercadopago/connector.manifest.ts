import type { ConnectorManifest } from '@integrax/connector-sdk';

const manifest = {
  service: 'mercadopago',

  auth: { type: 'api_key' as const },

  capabilities: ['read', 'write', 'webhook_inbound', 'polling', 'payments'] as const,

  webhooks_supported: true,
  polling_supported: true,
  cursor_fields: ['date_last_updated', 'date_created'],
  entities_supported: ['payment', 'subscription', 'refund'],

  /**
   * Granular payment capabilities supported by this connector.
   * The operation-engine validates these before dispatching payment commands.
   */
  payment_capabilities: [
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
  ] as const,

  operations: {
    get_payment: true,
    search_payments: true,
    create_payment: true,
    refund_payment: true,
    cancel_payment: true,
    create_preference: true,   // hosted checkout link
    create_qr: true,           // QR payment (Cobros con QR)
    create_preapproval: true,  // subscription
    pause_preapproval: true,
    cancel_preapproval: true,
    create_card_token: true,   // tokenize card
  },

  entities: {
    payment: {
      source: 'payments',
      identity: {
        primary: ['id'],
        fallback: ['external_reference'],
      },
      fields: {
        externalId:          'id',
        amount:              'transaction_amount',
        currency:            'currency_id',
        status:              'status',
        methodType:          'payment_type_id',
        installments:        'installments',
        description:         'description',
        transactionReference: 'external_reference',
        payerId:             'payer.id',
        authorizedAt:        'date_approved',
        capturedAt:          'date_approved',
        rejectionCode:       'status_detail',
        updatedAt:           'date_last_updated',
      },
    },
    subscription: {
      source: 'preapproval',
      identity: {
        primary: ['id'],
        fallback: ['external_reference'],
      },
      fields: {
        externalId:      'id',
        planId:          'preapproval_plan_id',
        status:          'status',
        amount:          'auto_recurring.transaction_amount',
        currency:        'auto_recurring.currency_id',
        customerId:      'payer_id',
        nextBillingAt:   'next_payment_date',
        cancelledAt:     'date_cancelled',
        updatedAt:       'date_last_modified',
      },
    },
  },

  drift: {
    endpoints: ['payments', 'preapproval'],
  },
} satisfies ConnectorManifest;

export default manifest;
